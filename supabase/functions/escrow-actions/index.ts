import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { validateTelegramWebAppData } from "../_shared/telegram-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-init-data",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LINE = "━━━━━━━━━━━━━━━━━━━━━━";

async function sendMessage(botToken: string, chatId: number, text: string, replyMarkup?: any) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Verify Telegram Authentication
    const initData = req.headers.get("x-telegram-init-data");
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!initData || !botToken) {
      throw new Error("Missing authentication credentials");
    }

    const tgUser = validateTelegramWebAppData(initData, botToken);
    const userTelegramTag = `@${tgUser.username}`;

    // 2. Parse Action
    const { action, payload } = await req.json();

    let result;

    switch (action) {
      case "create_deal": {
        const { seller, amount, description, market_listing_id } = payload;

        if (seller.toLowerCase() === tgUser.username?.toLowerCase()) {
          throw new Error("Cannot trade with yourself");
        }

        const fee = Math.max(300, Math.round(amount * 0.05));
        const dealId = `ESC-${Date.now().toString(36).toUpperCase()}`;
        const cleanDesc = description.trim().replace(/[<>&]/g, "").substring(0, 200);

        const { data, error } = await supabaseClient.from("deals").insert({
          deal_id: dealId,
          buyer_telegram: userTelegramTag,
          seller_telegram: `@${seller.replace("@", "")}`,
          amount,
          fee,
          description: cleanDesc,
          status: "pending",
          market_listing_id
        }).select().single();

        if (error) throw error;

        // --- Proactive Notifications ---
        try {
          const sellerReceives = amount - fee;
          const miniAppLink = `https://t.me/TrustPay9jaBot/app?startapp=deal_${dealId}`;

          // 1. Notify Buyer
          await sendMessage(botToken, tgUser.id,
            `🛒 <b>Escrow Deal Initiated!</b>\n${LINE}\n\n` +
            `🆔 <code>${dealId}</code>\n` +
            `📝 ${cleanDesc}\n` +
            `👤 Seller: @${seller.replace("@", "")}\n\n` +
            `💰 Amount: ₦${amount.toLocaleString()}\n` +
            `💵 Fee (5%): ₦${fee.toLocaleString()}\n` +
            `📤 Seller gets: ₦${sellerReceives.toLocaleString()}\n\n` +
            `⏳ <b>Waiting for seller to accept.</b>\nYou'll be notified when they are ready for payment.\n${LINE}`,
            { inline_keyboard: [[{ text: "🚀 View in App", url: miniAppLink }]] }
          );

          // 2. Notify Seller
          // Look up seller's chat ID (if they've used the bot before)
          const { data: sellerProfile } = await supabaseClient
            .from("bot_users")
            .select("telegram_id")
            .ilike("username", seller.replace("@", ""))
            .maybeSingle();

          if (sellerProfile?.telegram_id) {
            await sendMessage(botToken, sellerProfile.telegram_id,
              `📩 <b>New Escrow Request!</b>\n${LINE}\n\n` +
              `🆔 <code>${dealId}</code>\n` +
              `📝 ${cleanDesc}\n` +
              `👤 Buyer: @${tgUser.username || "User"}\n\n` +
              `💰 Amount: ₦${amount.toLocaleString()}\n` +
              `📤 You'll receive: ₦${sellerReceives.toLocaleString()}\n\n` +
              `👇 <b>Please accept or decline in the app:</b>\n${LINE}`,
              {
                inline_keyboard: [
                  [{ text: "🚀 View in App", url: miniAppLink }],
                ]
              }
            );
          }
        } catch (notifyErr) {
          console.error("Proactive notification failed:", notifyErr);
          // Don't fail the whole request if notification fails
        }

        await supabaseClient.from("audit_logs").insert([{
          deal_id: dealId, action: "deal_created", actor: userTelegramTag,
          details: { amount, seller: `@${seller}`, description: cleanDesc },
        }]);

        result = { success: true, deal: data };
        break;
      }

      case "accept_deal": {
        const { deal_id } = payload;
        // Verify user is the seller
        const { data: deal } = await supabaseClient.from("deals").select("*").eq("deal_id", deal_id).single();
        if (!deal || deal.seller_telegram.toLowerCase() !== userTelegramTag.toLowerCase()) {
          throw new Error("Unauthorized: Only the seller can accept this deal");
        }
        if (deal.status !== "pending") throw new Error("Deal is no longer pending");

        const { error } = await supabaseClient.from("deals").update({ status: "accepted" }).eq("deal_id", deal_id);
        if (error) throw error;

        await supabaseClient.from("audit_logs").insert([{ deal_id, action: "deal_accepted", actor: userTelegramTag, details: { amount: deal.amount, buyer: deal.buyer_telegram } }]);

        result = { success: true };
        break;
      }

      case "decline_deal": {
        const { deal_id } = payload;
        const { data: deal } = await supabaseClient.from("deals").select("*").eq("deal_id", deal_id).single();
        if (!deal || deal.seller_telegram.toLowerCase() !== userTelegramTag.toLowerCase()) {
          throw new Error("Unauthorized");
        }
        if (deal.status !== "pending") throw new Error("Deal is no longer pending");

        const { error } = await supabaseClient.from("deals").update({ status: "completed", completed_at: new Date().toISOString(), dispute_resolution: "declined_by_seller" }).eq("deal_id", deal_id);
        if (error) throw error;

        await supabaseClient.from("audit_logs").insert([{ deal_id, action: "deal_declined", actor: userTelegramTag, details: { reason: "Seller declined via Mini App", amount: deal.amount } }]);
        result = { success: true };
        break;
      }

      case "mark_delivered": {
        const { deal_id } = payload;
        const { data: deal } = await supabaseClient.from("deals").select("*").eq("deal_id", deal_id).single();
        if (!deal || deal.seller_telegram.toLowerCase() !== userTelegramTag.toLowerCase()) throw new Error("Unauthorized");
        if (deal.status !== "funded" || deal.delivered_at) throw new Error("Invalid state for delivery");

        const { error } = await supabaseClient.from("deals").update({ delivered_at: new Date().toISOString() }).eq("deal_id", deal_id);
        if (error) throw error;

        await supabaseClient.from("audit_logs").insert([{ deal_id, action: "delivery_marked", actor: userTelegramTag, details: { amount: deal.amount, buyer: deal.buyer_telegram } }]);
        result = { success: true };
        break;
      }

      case "confirm_received": {
        const { deal_id } = payload;
        const { data: deal } = await supabaseClient.from("deals").select("*").eq("deal_id", deal_id).single();
        if (!deal || deal.buyer_telegram.toLowerCase() !== userTelegramTag.toLowerCase()) throw new Error("Unauthorized");
        if (deal.status !== "funded" || !deal.delivered_at) throw new Error("Invalid state for confirmation");

        const { error } = await supabaseClient.from("deals").update({ status: "completed", completed_at: new Date().toISOString() }).eq("deal_id", deal_id);
        if (error) throw error;

        await supabaseClient.from("audit_logs").insert([{ deal_id, action: "delivery_confirmed", actor: userTelegramTag, details: { amount: deal.amount, fee: deal.fee } }]);
        // Note: The database webhook usually handles the actual paystack payout on completion.
        result = { success: true };
        break;
      }

      case "open_dispute": {
        const { deal_id, reason, evidence_url } = payload;
        const { data: deal } = await supabaseClient.from("deals").select("*").eq("deal_id", deal_id).single();
        if (!deal || deal.buyer_telegram.toLowerCase() !== userTelegramTag.toLowerCase()) throw new Error("Unauthorized");
        if (deal.status !== "funded") throw new Error("Only funded deals can be disputed");

        const { error } = await supabaseClient.from("deals").update({ status: "disputed", dispute_reason: reason }).eq("deal_id", deal_id);
        if (error) throw error;

        await supabaseClient.from("audit_logs").insert([{ deal_id, action: "dispute_opened", actor: userTelegramTag, details: { reason, evidence_url, amount: deal.amount, seller: deal.seller_telegram } }]);
        result = { success: true };
        break;
      }

      case "get_user_deals": {
        const { limit = 50, active_only = false } = payload || {};
        let query = supabaseClient
          .from("deals")
          .select("*")
          .or(`buyer_telegram.ilike.${userTelegramTag},seller_telegram.ilike.${userTelegramTag}`)
          .order("created_at", { ascending: false });

        if (active_only) {
          query = query.not("status", "in", '("completed","refunded")');
        }

        const { data, error } = await query.limit(limit);
        if (error) throw error;
        result = { success: true, deals: data };
        break;
      }

      case "get_notifications": {
        const { limit = 30 } = payload || {};
        const { data, error } = await supabaseClient
          .from("audit_logs")
          .select("*")
          .or(`actor.ilike.${userTelegramTag},details->>seller.ilike.${userTelegramTag},details->>buyer.ilike.${userTelegramTag}`)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) throw error;
        result = { success: true, notifications: data };
        break;
      }

      case "get_deal": {
        const { deal_id } = payload;
        const { data: deal, error } = await supabaseClient
          .from("deals")
          .select("*")
          .eq("deal_id", deal_id)
          .or(`buyer_telegram.ilike.${userTelegramTag},seller_telegram.ilike.${userTelegramTag}`)
          .single();
        if (error) throw error;
        result = { success: true, deal };
        break;
      }

      case "log_audit": {
        const { audit_action, details } = payload;
        await supabaseClient.from("audit_logs").insert([{
          action: audit_action,
          actor: userTelegramTag,
          details: details || {},
        }]);
        result = { success: true };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

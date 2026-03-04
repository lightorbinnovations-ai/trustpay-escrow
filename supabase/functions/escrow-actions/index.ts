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
      console.error("Missing auth headers or bot token");
      return new Response(JSON.stringify({ error: "Missing authentication credentials" }), { status: 401, headers: corsHeaders });
    }

    let tgUser;
    try {
      tgUser = validateTelegramWebAppData(initData, botToken);
    } catch (authErr) {
      console.error("Auth validation failed:", authErr);
      return new Response(JSON.stringify({ error: `Auth failed: ${authErr.message}` }), { status: 401, headers: corsHeaders });
    }

    // Handle optional username and avoid "undefined" string literal issues
    const rawUsername = tgUser.username?.toString().toLowerCase() || "";
    const isInvalidUsername = !rawUsername || rawUsername === "undefined" || rawUsername === "null" || rawUsername === "";

    const safeUsername = isInvalidUsername
      ? `user_${tgUser.id}`
      : rawUsername.replace(/^@/, "");

    const userTelegramTag = `@${safeUsername}`;

    // 2. Parse Action
    const { action, payload } = await req.json();
    console.log(`Action: ${action}, User: ${userTelegramTag}`, payload);

    let result: any = { success: false };

    switch (action) {
      case "create_deal": {
        const { seller, amount, description, market_listing_id } = payload;

        if (seller.toLowerCase() === tgUser.username?.toLowerCase()) {
          throw new Error("Cannot trade with yourself");
        }

        const fee = Math.max(300, Math.round(amount * 0.03));
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
            `💵 Fee (3%): ₦${fee.toLocaleString()}\n` +
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
              `👤 Buyer: ${userTelegramTag}\n\n` +
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

      case "update_deal": {
        const { deal_id, amount, description } = payload;
        const { data: deal } = await supabaseClient.from("deals").select("*").eq("deal_id", deal_id).single();
        if (!deal || deal.buyer_telegram.toLowerCase() !== userTelegramTag.toLowerCase()) throw new Error("Unauthorized");
        if (deal.status !== "pending") throw new Error("Deal can only be edited while pending");

        const fee = Math.max(300, Math.round(amount * 0.03));
        const { error } = await supabaseClient.from("deals").update({
          amount,
          fee,
          description: description.trim().replace(/[<>&]/g, "").substring(0, 200)
        }).eq("deal_id", deal_id);

        if (error) throw error;
        await supabaseClient.from("audit_logs").insert([{ deal_id, action: "deal_updated", actor: userTelegramTag, details: { new_amount: amount, new_description: description } }]);
        result = { success: true };
        break;
      }

      case "delete_deal": {
        const { deal_id } = payload;
        const { data: deal } = await supabaseClient.from("deals").select("*").eq("deal_id", deal_id).single();
        if (!deal || deal.buyer_telegram.toLowerCase() !== userTelegramTag.toLowerCase()) throw new Error("Unauthorized");
        if (deal.status !== "pending") throw new Error("Deal can only be deleted while pending");

        const { error } = await supabaseClient.from("deals").delete().eq("deal_id", deal_id);
        if (error) throw error;
        await supabaseClient.from("audit_logs").insert([{ deal_id, action: "deal_deleted", actor: userTelegramTag, details: { amount: deal.amount } }]);
        result = { success: true };
        break;
      }

      case "accept_deal": {
        const { deal_id } = payload;
        // Verify user is the seller
        const { data: deal, error: fetchErr } = await supabaseClient.from("deals").select("*").eq("deal_id", deal_id).maybeSingle();

        if (fetchErr) throw fetchErr;
        if (!deal) {
          console.error(`Deal not found: ${deal_id}`);
          return new Response(JSON.stringify({ error: "Deal not found" }), { status: 404, headers: corsHeaders });
        }

        const isSeller = deal.seller_telegram.toLowerCase() === userTelegramTag.toLowerCase();
        if (!isSeller) {
          console.error(`Unauthorized accept: User ${userTelegramTag} is not Seller ${deal.seller_telegram}`);
          return new Response(JSON.stringify({ error: "Unauthorized: Only the seller can accept this deal" }), { status: 403, headers: corsHeaders });
        }

        if (deal.status !== "pending") {
          return new Response(JSON.stringify({ error: `Deal is no longer pending (current status: ${deal.status})` }), { status: 400, headers: corsHeaders });
        }

        // --- Initialize Paystack Payment Link ---
        const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
        let payLink = null;
        let paymentRef = null;

        if (PAYSTACK_SECRET_KEY) {
          try {
            const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
              method: "POST",
              headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                amount: deal.amount * 100, // Paystack uses Kobo
                email: `${deal.buyer_telegram.replace("@", "")}@escrowbot.ng`,
                reference: `${deal_id}-${Date.now()}`,
                metadata: { deal_id: deal_id, buyer: deal.buyer_telegram, seller: deal.seller_telegram },
                callback_url: "https://t.me/TrustPay9jaBot",
              }),
            });
            const paystackData = await paystackRes.json();
            if (paystackData.status && paystackData.data?.authorization_url) {
              payLink = paystackData.data.authorization_url;
              paymentRef = paystackData.data.reference;
            }
          } catch (pErr) {
            console.error("Paystack init failed during accept:", pErr);
          }
        }

        const { error } = await supabaseClient.from("deals").update({
          status: "accepted",
          paystack_payment_link: payLink,
          payment_ref: paymentRef
        }).eq("deal_id", deal_id);

        if (error) throw error;

        await supabaseClient.from("audit_logs").insert([{ deal_id, action: "deal_accepted", actor: userTelegramTag, details: { amount: deal.amount, buyer: deal.buyer_telegram, pay_link: !!payLink } }]);

        result = { success: true };

        // Notify buyer - deal is accepted and payment is ready
        supabaseClient.functions.invoke("deal-notify", { body: { deal_id, action: "deal_accepted" } }).catch(e => console.error("Notify error:", e));

        break;
      }


      case "decline_deal": {
        const { deal_id } = payload;
        const { data: deal } = await supabaseClient.from("deals").select("*").eq("deal_id", deal_id).single();
        if (!deal || deal.seller_telegram.toLowerCase() !== userTelegramTag.toLowerCase()) {
          throw new Error("Unauthorized");
        }
        if (deal.status !== "pending") throw new Error("Deal is no longer pending");

        const { error } = await supabaseClient.from("deals").update({ status: "cancelled", completed_at: new Date().toISOString(), dispute_resolution: "declined_by_seller" }).eq("deal_id", deal_id);
        if (error) throw error;

        // Also notify buyer
        supabaseClient.functions.invoke("deal-notify", { body: { deal_id, action: "deal_declined" } }).catch(console.error);

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

        // Notify seller and trigger payout
        supabaseClient.functions.invoke("deal-notify", { body: { deal_id, action: "delivery_confirmed" } }).catch(e => console.error("Notify error:", e));

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

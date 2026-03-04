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
  try {
    const res = await fetch(url, {
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
    if (!res.ok) console.error(`Bot notify failed: ${await res.text()}`);
  } catch (e) {
    console.error("Bot notify error:", e);
  }
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  "pending": ["accepted", "cancelled"],
  "accepted": ["funded", "cancelled"],
  "funded": ["delivered", "disputed"],
  "delivered": ["completed", "disputed"],
  "disputed": ["resolved_buyer", "resolved_seller"],
  "completed": [],
  "cancelled": [],
  "resolved_buyer": [],
  "resolved_seller": []
};

function validateTransition(from: string, to: string) {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Illegal state transition from '${from}' to '${to}'.`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const initData = req.headers.get("x-telegram-init-data");
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!initData || !botToken) {
      return new Response(JSON.stringify({ error: "Missing authentication" }), { status: 401, headers: corsHeaders });
    }

    let tgUser;
    try {
      tgUser = validateTelegramWebAppData(initData, botToken);
    } catch (authErr: any) {
      return new Response(JSON.stringify({ error: `Invalid Auth: ${authErr.message}` }), { status: 401, headers: corsHeaders });
    }

    // Role detection ONLY by Telegram ID
    const userId = Number(tgUser.id);
    const rawUsername = tgUser.username?.toString().toLowerCase() || "";
    const safeUsername = (!rawUsername || ["undefined", "null"].includes(rawUsername)) ? `user_${userId}` : rawUsername.replace(/^@/, "");
    const userTelegramTag = `@${safeUsername}`;

    const { action, payload } = await req.json();
    console.log(`[STATE-MACHINE] Action: ${action}, ID: ${userId}, Tag: ${userTelegramTag}`);

    let result: any = { success: false };

    switch (action) {
      case "create_deal": {
        const { seller, amount, description, market_listing_id } = payload;

        if (!amount || isNaN(amount) || amount <= 0) {
          throw new Error("Amount must be greater than 0.");
        }
        if (!description || typeof description !== "string" || description.trim() === "") {
          throw new Error("Description cannot be empty.");
        }

        const cleanSeller = seller.replace("@", "").toLowerCase();

        const { data: sellerBot, error: botErr } = await supabaseClient.from("bot_users").select("telegram_id").ilike("username", cleanSeller).maybeSingle();
        if (botErr) throw botErr;

        const { data: sellerProf } = await supabaseClient.from("user_profiles").select("telegram_chat_id").ilike("telegram_username", cleanSeller).maybeSingle();
        const sellerId = sellerBot?.telegram_id || sellerProf?.telegram_chat_id || null;

        if (!sellerId) throw new Error("Seller not found. The seller must have a TrustPay account.");
        if (Number(sellerId) === userId) throw new Error("Cannot trade with yourself.");

        const fee = Math.max(300, Math.round(amount * 0.03));
        const dealId = `ESC-${Date.now().toString(36).toUpperCase()}`;
        const cleanDesc = description.trim().replace(/[<>&]/g, "").substring(0, 200);

        const { data: deal, error: insertErr } = await supabaseClient.from("deals").insert({
          deal_id: dealId,
          buyer_telegram: userTelegramTag,
          seller_telegram: `@${cleanSeller}`,
          buyer_id: userId,
          seller_id: Number(sellerId),
          amount,
          fee,
          description: cleanDesc,
          status: "pending",
          market_listing_id
        }).select().single();

        if (insertErr) throw insertErr;

        const miniAppLink = `https://t.me/TrustPay9jaBot/app?startapp=deal_${dealId}`;
        await sendMessage(botToken, Number(sellerId),
          `📩 <b>New Escrow Request!</b>\n${LINE}\n\n` +
          `🆔 <code>${dealId}</code>\n` +
          `📝 ${cleanDesc}\n` +
          `👤 Buyer: ${userTelegramTag}\n\n` +
          `💰 Amount: ₦${amount.toLocaleString()}\n\n` +
          `👇 <b>Accept or decline in the app:</b>\n${LINE}`,
          { inline_keyboard: [[{ text: "🚀 Open App", url: miniAppLink }]] }
        );

        await supabaseClient.from("audit_logs").insert([{
          deal_id: dealId, action: "deal_created", actor: userTelegramTag,
          details: { amount, seller: `@${cleanSeller}`, buyer_id: userId, seller_id: Number(sellerId) }
        }]);

        result = { success: true, deal };
        break;
      }

      case "accept_deal":
      case "decline_deal":
      case "mark_delivered":
      case "update_deal":
      case "delete_deal":
      case "confirm_received":
      case "open_dispute": {
        const { deal_id } = payload;

        // 1. Double Action / State Corruption Protection: Fetch current status first
        const { data: currentDeal, error: fetchErr } = await supabaseClient
          .from("deals")
          .select("status, buyer_id, seller_id")
          .eq("deal_id", deal_id)
          .maybeSingle();

        if (fetchErr) throw fetchErr;
        if (!currentDeal) throw new Error("Deal not found.");

        const isBuyer = currentDeal.buyer_id === userId;
        const isSeller = currentDeal.seller_id === userId;
        const previousStatus = currentDeal.status;

        // 2. Validate Transitions & Authorization
        let nextStatus = previousStatus;
        let updatePayload: any = {};
        let notifyAction = null;

        if (action === "accept_deal") {
          if (!isSeller) throw new Error("Unauthorized: Only seller can accept.");
          nextStatus = "accepted";
          validateTransition(previousStatus, nextStatus);
          updatePayload = { status: nextStatus };
          notifyAction = "deal_accepted";
        }
        else if (action === "decline_deal") {
          if (!isSeller) throw new Error("Unauthorized: Only seller can decline.");
          nextStatus = "cancelled";
          validateTransition(previousStatus, nextStatus);
          updatePayload = { status: nextStatus };
          notifyAction = "deal_declined";
        }
        else if (action === "mark_delivered") {
          if (!isSeller) throw new Error("Unauthorized: Only seller can mark delivered.");
          nextStatus = "delivered";
          validateTransition(previousStatus, nextStatus);
          updatePayload = { status: nextStatus, delivered_at: new Date().toISOString() };
          notifyAction = "delivery_marked";
        }
        else if (action === "update_deal") {
          if (!isBuyer) throw new Error("Unauthorized: Only buyer can edit deal.");
          if (previousStatus !== "pending") throw new Error("Can only edit pending deals.");

          const amt = payload.amount;
          const fee = Math.max(300, Math.round(amt * 0.03));
          updatePayload = {
            amount: amt,
            fee,
            description: payload.description.trim().replace(/[<>&]/g, "").substring(0, 200)
          };
          // Status remains pending
        }
        else if (action === "delete_deal") {
          if (!isBuyer) throw new Error("Unauthorized: Only buyer can delete deal.");
          nextStatus = "cancelled";
          validateTransition(previousStatus, nextStatus);

          const { error: delErr } = await supabaseClient
            .from("deals")
            .delete()
            .eq("deal_id", deal_id)
            .eq("buyer_id", userId)
            .eq("status", "pending"); // Double check

          if (delErr) throw delErr;

          // Log deletion
          await supabaseClient.from("audit_logs").insert([{
            deal_id, action: "deal_deleted", actor: userTelegramTag,
            details: { previousStatus, newStatus: "deleted", buyer_id: userId }
          }]);

          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        else if (action === "confirm_received") {
          if (!isBuyer) throw new Error("Unauthorized: Only buyer can confirm receipt.");
          nextStatus = "completed";
          validateTransition(previousStatus, nextStatus);
          updatePayload = { status: nextStatus, completed_at: new Date().toISOString() };
          notifyAction = "delivery_confirmed";
        }
        else if (action === "open_dispute") {
          if (!isBuyer) throw new Error("Unauthorized: Only buyer can dispute.");
          nextStatus = "disputed";
          validateTransition(previousStatus, nextStatus); // Requires funded or delivered
          updatePayload = { status: nextStatus, dispute_reason: payload.reason };
        }

        // 3. Perform Update with Strict Zero-Row Protection
        let updateQuery = supabaseClient
          .from("deals")
          .update(updatePayload)
          .eq("deal_id", deal_id)
          .eq("status", previousStatus); // Optimistic locking!

        if (isBuyer) updateQuery = updateQuery.eq("buyer_id", userId);
        if (isSeller) updateQuery = updateQuery.eq("seller_id", userId);

        const { data: updatedDeal, error: updateErr } = await updateQuery.select().maybeSingle();

        if (updateErr) throw updateErr;
        if (!updatedDeal) throw new Error("Transition failed. Deal state may have been modified concurrently or authorization was denied.");

        // 4. Structured Logging
        await supabaseClient.from("audit_logs").insert([{
          deal_id, action, actor: userTelegramTag,
          details: {
            previous_status: previousStatus,
            new_status: nextStatus,
            user_id: userId,
            ...payload
          }
        }]);

        if (notifyAction) {
          supabaseClient.functions.invoke("deal-notify", { body: { deal_id, action: notifyAction } }).catch(() => { });
        }

        result = { success: true };
        break;
      }

      case "get_user_deals": {
        const { limit = 50, active_only = false } = payload || {};
        let query = supabaseClient.from("deals")
          .select("*")
          .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
          .order("created_at", { ascending: false });

        if (active_only) query = query.not("status", "in", '("completed","refunded","cancelled")');
        const { data, error } = await query.limit(limit);
        if (error) throw error;
        result = { success: true, deals: data };
        break;
      }

      case "get_deal": {
        const { deal_id } = payload;
        const { data, error } = await supabaseClient
          .from("deals")
          .select("*")
          .eq("deal_id", deal_id)
          .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Deal not found or unauthorized.");
        result = { success: true, deal: data };
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
    console.error(`[STATE-MACHINE ERROR] ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { deal_id, action } = await req.json();

    if (!deal_id) return new Response(JSON.stringify({ error: "deal_id required" }), { status: 400, headers: corsHeaders });

    const { data: deal } = await supabase.from("deals").select("*").eq("deal_id", deal_id).single();
    if (!deal) return new Response(JSON.stringify({ error: "Deal not found" }), { status: 404, headers: corsHeaders });

    async function sendTelegram(chatId: number, text: string, replyMarkup?: unknown) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
      });
    }

    // Case-insensitive username lookup
    async function getChatId(username: string): Promise<number | null> {
      const { data } = await supabase.from("user_profiles").select("telegram_chat_id").ilike("telegram_username", username).maybeSingle();
      return data?.telegram_chat_id || null;
    }

    async function notifyUser(username: string, msg: string, replyMarkup?: unknown) {
      const chatId = await getChatId(username);
      if (chatId) { await sendTelegram(chatId, msg, replyMarkup); return true; }
      return false;
    }

    const LINE = "━━━━━━━━━━━━━━━━━━━━━━";
    const fee = deal.fee;
    const sellerReceives = deal.amount - fee;

    if (action === "deal_created") {
      await notifyUser(deal.seller_telegram,
        `📩 <b>New Deal Request!</b>\n${LINE}\n\n` +
        `🆔 <code>${deal.deal_id}</code>\n📝 ${deal.description}\n👤 Buyer: ${deal.buyer_telegram}\n\n` +
        `💰 Amount: ₦${deal.amount.toLocaleString()}\n📤 You'll receive: ₦${sellerReceives.toLocaleString()}\n\n` +
        `🟡 <b>Awaiting your acceptance</b>\n${LINE}`,
        { inline_keyboard: [
          [{ text: "✅ Accept Deal", callback_data: `accept_pending_${deal.deal_id}` }, { text: "🚫 Decline", callback_data: `decline_pending_${deal.deal_id}` }],
          [{ text: "📋 My Deals", callback_data: "open_mydeals" }],
        ]}
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    if (action === "deal_accepted") {
      await notifyUser(deal.buyer_telegram,
        `✅ <b>Deal Accepted!</b>\n${LINE}\n\n` +
        `🆔 <code>${deal.deal_id}</code>\n📝 ${deal.description}\n👤 Seller: ${deal.seller_telegram}\n\n` +
        `💰 Amount: ₦${deal.amount.toLocaleString()}\n\n🟠 <b>You can now proceed to pay.</b>\n${LINE}`,
        { inline_keyboard: [
          ...(deal.paystack_payment_link ? [[{ text: "💳 Pay Now", url: deal.paystack_payment_link }]] : []),
          [{ text: "📋 My Deals", callback_data: "open_mydeals" }],
        ]}
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    if (action === "deal_declined") {
      await notifyUser(deal.buyer_telegram,
        `🚫 <b>Deal Declined</b>\n${LINE}\n\n🆔 <code>${deal.deal_id}</code>\n👤 Seller ${deal.seller_telegram} declined this deal.\n${LINE}`,
        { inline_keyboard: [[{ text: "➕ New Deal", callback_data: "open_newdeal" }]] }
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    if (action === "delivery_marked") {
      await notifyUser(deal.buyer_telegram,
        `📦 <b>Delivery Marked!</b>\n${LINE}\n\n` +
        `🆔 <code>${deal.deal_id}</code>\n👤 Seller ${deal.seller_telegram} says they've delivered.\n\n` +
        `✅ <b>Please confirm you received the item/service.</b>\n${LINE}`,
        { inline_keyboard: [
          [{ text: "✅ I Received It", callback_data: `received_${deal.deal_id}` }, { text: "⚠️ Dispute", callback_data: `dispute_${deal.deal_id}` }],
        ]}
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    if (action === "delivery_confirmed") {
      // CRITICAL: Trigger Paystack transfer to seller when buyer confirms via Mini App
      const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
      let transferSuccess = false;

      if (PAYSTACK_SECRET_KEY) {
        const { data: sellerProfile } = await supabase.from("user_profiles").select("paystack_recipient_code, bank_name").ilike("telegram_username", deal.seller_telegram).maybeSingle();
        if (sellerProfile?.paystack_recipient_code) {
          const res = await fetch("https://api.paystack.co/transfer", {
            method: "POST",
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ source: "balance", amount: sellerReceives * 100, recipient: sellerProfile.paystack_recipient_code, reason: `Escrow payout for ${deal_id}`, metadata: { deal_id } }),
          });
          const data = await res.json();
          if (data.status) {
            transferSuccess = true;
            await supabase.from("deals").update({ transfer_ref: data.data?.transfer_code || data.data?.reference }).eq("deal_id", deal_id);
            await supabase.from("audit_logs").insert([{
              deal_id, action: "transfer_initiated", actor: "system",
              details: { amount: sellerReceives, seller: deal.seller_telegram, method: "auto_from_miniapp" },
            }]);
          } else {
            console.error("Transfer failed:", data);
          }
        }
      }

      // Notify seller
      await notifyUser(deal.seller_telegram,
        `🎉 <b>Payment Released!</b>\n${LINE}\n\n` +
        `🆔 <code>${deal.deal_id}</code>\n💰 ₦${sellerReceives.toLocaleString()} is being sent to your bank!\n\n` +
        (transferSuccess ? `✅ Transfer initiated to your bank account.\n` : `💰 Admin will process your payout.\n`) +
        `✅ <b>Deal completed successfully.</b>\n${LINE}`,
        { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
      );
      return new Response(JSON.stringify({ ok: true, transfer: transferSuccess }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true, action: "unknown" }), { headers: corsHeaders });
  } catch (err) {
    console.error("deal-notify error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});

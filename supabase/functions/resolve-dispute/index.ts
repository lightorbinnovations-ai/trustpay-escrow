import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");

    const { deal_id, resolution } = await req.json();
    if (!deal_id || !resolution) throw new Error("Missing deal_id or resolution");
    if (!["release_to_seller", "refund_buyer"].includes(resolution)) throw new Error("Invalid resolution");

    const { data: deal } = await supabase.from("deals").select("*").eq("deal_id", deal_id).single();
    if (!deal) throw new Error("Deal not found");
    if (deal.status !== "disputed") throw new Error("Deal is not disputed");

    async function sendTelegram(chatId: number, text: string, replyMarkup?: unknown) {
      if (!TELEGRAM_BOT_TOKEN) return;
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
      });
    }

    async function notifyByUsername(username: string, text: string, replyMarkup?: unknown) {
      const { data: profile } = await supabase.from("user_profiles").select("telegram_chat_id").ilike("telegram_username", username).maybeSingle();
      if (profile?.telegram_chat_id) await sendTelegram(profile.telegram_chat_id, text, replyMarkup);
    }

    const sellerAmount = deal.amount - deal.fee;
    let actionResult = "pending_admin";

    if (resolution === "refund_buyer") {
      // Refund via Paystack
      if (PAYSTACK_SECRET_KEY && deal.payment_ref) {
        const res = await fetch("https://api.paystack.co/refund", {
          method: "POST",
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ transaction: deal.payment_ref }),
        });
        const data = await res.json();
        actionResult = data.status === true ? "refunded" : "refund_failed";
      }

      await supabase.from("deals").update({
        status: "completed", dispute_resolution: "refund_buyer",
        dispute_resolved_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      }).eq("deal_id", deal_id);

      await notifyByUsername(deal.buyer_telegram,
        `✅ <b>Dispute Resolved — Refund</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n🆔 <code>${deal_id}</code>\n💰 ₦${deal.amount.toLocaleString()}\n\n` +
        (actionResult === "refunded" ? `💸 Refund initiated! It may take 1-3 business days.\n` : `⏳ Admin is processing your refund.\n`) +
        `━━━━━━━━━━━━━━━━━━━━━━`,
        { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
      );

      await notifyByUsername(deal.seller_telegram,
        `❌ <b>Dispute Resolved — Refunded to Buyer</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n🆔 <code>${deal_id}</code>\n📝 ${deal.description}\n💰 ₦${deal.amount.toLocaleString()}\n\nThe admin has decided to refund the buyer.\n━━━━━━━━━━━━━━━━━━━━━━`,
        { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
      );
    } else {
      // Release to seller
      let transferSuccess = false;
      if (PAYSTACK_SECRET_KEY) {
        const { data: sellerProfile } = await supabase.from("user_profiles").select("paystack_recipient_code").ilike("telegram_username", deal.seller_telegram).maybeSingle();
        if (sellerProfile?.paystack_recipient_code) {
          const res = await fetch("https://api.paystack.co/transfer", {
            method: "POST",
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ source: "balance", amount: sellerAmount * 100, recipient: sellerProfile.paystack_recipient_code, reason: `Dispute resolved: ${deal_id}`, metadata: { deal_id } }),
          });
          const data = await res.json();
          transferSuccess = data.status === true;
          if (transferSuccess) {
            await supabase.from("deals").update({ transfer_ref: data.data?.transfer_code || data.data?.reference }).eq("deal_id", deal_id);
          }
        }
      }
      actionResult = transferSuccess ? "transferred" : "pending_admin";

      await supabase.from("deals").update({
        status: "completed", dispute_resolution: "release_to_seller",
        dispute_resolved_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      }).eq("deal_id", deal_id);

      await notifyByUsername(deal.seller_telegram,
        `🎉 <b>Dispute Resolved — Funds Released!</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n🆔 <code>${deal_id}</code>\n📤 You receive: ₦${sellerAmount.toLocaleString()}\n\n` +
        (transferSuccess ? `✅ Money sent to your bank account!\n` : `💰 Admin will process your payout.\n`) +
        `━━━━━━━━━━━━━━━━━━━━━━`,
        { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
      );

      await notifyByUsername(deal.buyer_telegram,
        `ℹ️ <b>Dispute Resolved — Released to Seller</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n🆔 <code>${deal_id}</code>\n💰 ₦${deal.amount.toLocaleString()}\n\nThe admin has released funds to the seller.\n━━━━━━━━━━━━━━━━━━━━━━`,
        { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
      );
    }

    await supabase.from("audit_logs").insert([{
      deal_id, action: `dispute_resolved_${resolution}`, actor: "admin",
      details: { amount: deal.amount, fee: deal.fee, buyer: deal.buyer_telegram, seller: deal.seller_telegram, result: actionResult },
    }]);

    return new Response(JSON.stringify({ ok: true, result: actionResult }), { headers: corsHeaders });
  } catch (error) {
    console.error("Resolve dispute error:", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: corsHeaders });
  }
});

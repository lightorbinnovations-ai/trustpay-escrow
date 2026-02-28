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

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: expiredDeals, error } = await supabase.from("deals").select("*").eq("status", "funded").lt("funded_at", cutoff);

    if (error) {
      console.error("Query error:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    if (!expiredDeals || expiredDeals.length === 0) {
      return new Response(JSON.stringify({ released: 0, message: "No deals to auto-release" }), { headers: corsHeaders });
    }

    async function sendTelegram(chatId: number, text: string, replyMarkup?: unknown) {
      if (!TELEGRAM_BOT_TOKEN) return;
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
      });
    }

    async function notifyByUsername(username: string, text: string, replyMarkup?: unknown) {
      const { data: profile } = await supabase.from("user_profiles").select("telegram_chat_id").eq("telegram_username", username).maybeSingle();
      if (profile?.telegram_chat_id) await sendTelegram(profile.telegram_chat_id, text, replyMarkup);
    }

    let released = 0;

    for (const deal of expiredDeals) {
      const { error: updateError } = await supabase.from("deals").update({
        status: "completed", completed_at: new Date().toISOString(), dispute_resolution: "auto_released_48h",
      }).eq("deal_id", deal.deal_id).eq("status", "funded");

      if (updateError) continue;
      released++;

      const sellerAmount = deal.amount - deal.fee;

      await supabase.from("audit_logs").insert([{
        deal_id: deal.deal_id, action: "auto_released", actor: "system",
        details: { amount: deal.amount, fee: deal.fee, seller: deal.seller_telegram, funded_at: deal.funded_at, hours_elapsed: Math.round((Date.now() - new Date(deal.funded_at).getTime()) / 3600000) },
      }]);

      // Try auto-transfer to seller
      let transferSuccess = false;
      if (PAYSTACK_SECRET_KEY) {
        const { data: sellerProfile } = await supabase.from("user_profiles").select("paystack_recipient_code").eq("telegram_username", deal.seller_telegram).maybeSingle();
        if (sellerProfile?.paystack_recipient_code) {
          const res = await fetch("https://api.paystack.co/transfer", {
            method: "POST",
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ source: "balance", amount: sellerAmount * 100, recipient: sellerProfile.paystack_recipient_code, reason: `Auto-release for ${deal.deal_id}`, metadata: { deal_id: deal.deal_id } }),
          });
          const data = await res.json();
          if (data.status) {
            transferSuccess = true;
            await supabase.from("deals").update({ transfer_ref: data.data?.transfer_code || data.data?.reference }).eq("deal_id", deal.deal_id);
            await supabase.from("audit_logs").insert([{
              deal_id: deal.deal_id, action: "transfer_initiated", actor: "system",
              details: { amount: sellerAmount, seller: deal.seller_telegram, method: "auto_release" },
            }]);
          }
        }
      }

      // Notify buyer
      await notifyByUsername(deal.buyer_telegram,
        `⏰ <b>Auto-Release (48h)</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🆔 Deal: <code>${deal.deal_id}</code>\n📝 ${deal.description}\n💰 ₦${deal.amount.toLocaleString()}\n\n` +
        `Since you didn't confirm or dispute within 48 hours, funds have been released to the seller.\n━━━━━━━━━━━━━━━━━━━━━━`,
        { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
      );

      // Notify seller
      await notifyByUsername(deal.seller_telegram,
        `🎉 <b>Funds Auto-Released!</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🆔 Deal: <code>${deal.deal_id}</code>\n📝 ${deal.description}\n💰 You receive: ₦${sellerAmount.toLocaleString()}\n\n` +
        (transferSuccess ? `✅ Money has been sent to your bank account!` : `💰 Admin will process your payout.`) +
        `\n━━━━━━━━━━━━━━━━━━━━━━`,
        { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
      );

      console.log(`Auto-released deal ${deal.deal_id} — ₦${sellerAmount} to ${deal.seller_telegram}, transfer: ${transferSuccess}`);
    }

    console.log(`Auto-release completed: ${released} deals released`);
    return new Response(JSON.stringify({ released, total_checked: expiredDeals.length }), { headers: corsHeaders });
  } catch (error) {
    console.error("Auto-release error:", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: corsHeaders });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!PAYSTACK_SECRET_KEY) throw new Error("PAYSTACK_SECRET_KEY not set");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Market project client
    const marketSupabase = createClient(
      Deno.env.get("MARKET_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("MARKET_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const rawBody = await req.text();

    // Validate webhook signature
    const signature = req.headers.get("x-paystack-signature");
    if (signature) {
      const hash = createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
      if (hash !== signature) {
        console.error("Invalid Paystack signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: corsHeaders });
      }
    }

    const body = JSON.parse(rawBody);
    const event = body.event;
    const data = body.data;

    console.log("Paystack webhook event:", event);

    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

    async function sendTelegram(chatId: number, text: string, replyMarkup?: unknown) {
      if (!TELEGRAM_BOT_TOKEN) return;
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
      });
    }

    async function notifyByUsername(username: string, text: string, replyMarkup?: unknown) {
      const { data: profile } = await supabase.from("user_profiles").select("telegram_chat_id").eq("telegram_username", username).maybeSingle();
      if (profile?.telegram_chat_id) {
        await sendTelegram(profile.telegram_chat_id, text, replyMarkup);
        return true;
      }
      return false;
    }

    if (event === "charge.success") {
      const reference = data.reference;
      const metadata = data.metadata || {};
      const dealId = metadata.deal_id;
      const isMarketTx = metadata.type === "market_transaction";

      if (isMarketTx) {
        const marketTxId = metadata.tx_id;
        if (!marketTxId) {
          console.error("No market tx_id in metadata");
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        // 1. Update Market Transaction status to "paid"
        await marketSupabase.from("transactions").update({
          status: "paid",
          funded_at: new Date().toISOString()
        }).eq("id", marketTxId);

        const listingTitle = metadata.listing_title || "Item";
        const buyerChatId = metadata.buyer_chat_id;
        const sellerTelegramId = metadata.seller_telegram_id;
        const amount = data.amount / 100;

        // 2. Notify Buyer
        if (buyerChatId) {
          await sendTelegram(buyerChatId,
            `✅ <b>Payment Confirmed!</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📝 <b>${listingTitle}</b>\n` +
            `💰 Amount: ₦${amount.toLocaleString()}\n\n` +
            `⏳ Waiting for seller to deliver. You'll be notified when they do.\n` +
            `🔒 Funds are safely held in escrow.`
          );
        }

        // 3. Notify Seller
        if (sellerTelegramId) {
          await sendTelegram(sellerTelegramId,
            `💰 <b>Payment Received!</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📝 <b>${listingTitle}</b>\n` +
            `💰 Amount: ₦${amount.toLocaleString()}\n` +
            `👤 Buyer: tg:${metadata.buyer_telegram_id}\n\n` +
            `Please deliver the item and mark as delivered below.\n━━━━━━━━━━━━━━━━━━━━━━`,
            {
              inline_keyboard: [
                [{ text: "📦 Mark Delivered", callback_data: `mkt_delivered_${marketTxId}` }],
              ]
            }
          );

          // 4. Insert Market Notification
          await marketSupabase.from("notifications").insert({
            recipient_telegram_id: sellerTelegramId,
            sender_telegram_id: metadata.buyer_telegram_id,
            title: "Escrow Payment Received",
            message: `Payment of ₦${amount.toLocaleString()} received for ${listingTitle}. Please deliver.`,
            type: "escrow_paid",
            listing_id: metadata.listing_id || null,
          });
        }

        await supabase.from("audit_logs").insert([{
          action: "marketplace_payment_confirmed", actor: "paystack",
          details: { tx_id: marketTxId, amount, listing: listingTitle },
        }]);

        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      if (!dealId) {
        console.error("No deal_id in payment metadata");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { data: existingDeal } = await supabase.from("deals").select("*").eq("deal_id", dealId).single();
      if (!existingDeal) {
        console.error("Deal not found:", dealId);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      // Payment only valid for "accepted" deals (seller already accepted)
      if (existingDeal.status !== "accepted") {
        console.log("Deal not in accepted state:", dealId, existingDeal.status);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // Update deal status to funded
      await supabase.from("deals").update({
        status: "funded", payment_ref: reference, funded_at: new Date().toISOString(),
      }).eq("deal_id", dealId);

      await supabase.from("audit_logs").insert([{
        deal_id: dealId, action: "payment_confirmed", actor: "paystack",
        details: { reference, amount: data.amount / 100 },
      }]);

      const amount = data.amount / 100;
      const buyerChatId = metadata.buyer_chat_id;

      // ✅ Notify BUYER — payment confirmed, waiting for seller to deliver
      if (buyerChatId) {
        await sendTelegram(buyerChatId,
          `✅ <b>Payment Confirmed!</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `🆔 Deal: <code>${dealId}</code>\n` +
          `💰 Amount: ₦${amount.toLocaleString()}\n` +
          `👤 Seller: ${existingDeal.seller_telegram}\n` +
          `📝 ${existingDeal.description}\n\n` +
          `💰 Funds are now held in escrow.\n` +
          `📦 Waiting for seller to deliver and mark as delivered.\n` +
          `Once delivered, you'll be asked to confirm receipt.\n\n` +
          `⏰ Funds auto-release in 48 hours if not confirmed.`,
          {
            inline_keyboard: [
              [{ text: "📋 My Deals", callback_data: "open_mydeals" }],
            ]
          }
        );
      }

      // ✅ Notify SELLER — payment received, deliver now
      const sellerAmount = existingDeal.amount - existingDeal.fee;
      await notifyByUsername(existingDeal.seller_telegram,
        `💰 <b>Payment Received!</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `┌─────────────────────┐\n` +
        `│ 🆔 <code>${dealId}</code>\n` +
        `│ 📝 ${existingDeal.description}\n` +
        `│ 👤 Buyer: ${existingDeal.buyer_telegram}\n│\n` +
        `│ 💰 Amount: ₦${existingDeal.amount.toLocaleString()}\n` +
        `│ 📤 You'll receive: ₦${sellerAmount.toLocaleString()}\n│\n` +
        `│ 🔵 Status: <b>Funded — Ready to Deliver</b>\n` +
        `└─────────────────────┘\n\n` +
        `✅ The buyer has paid! Please deliver the product/service.\n` +
        `📦 Once delivered, tap <b>"Mark Delivered"</b> below.\n` +
        `Then the buyer will confirm receipt and you'll get paid ₦${sellerAmount.toLocaleString()}.\n\n` +
        `⏰ Auto-release in 48 hours if buyer doesn't respond.`,
        {
          inline_keyboard: [
            [{ text: `📦 Mark Delivered`, callback_data: `delivered_${dealId}` }],
            [{ text: "📋 My Deals", callback_data: "open_mydeals" }],
          ]
        }
      );

      console.log(`Deal ${dealId} funded. Buyer + seller notified.`);
    }

    if (event === "transfer.success") {
      const reference = data.reference;
      const metadata = data.metadata || {};
      const dealId = metadata.deal_id;

      if (dealId) {
        await supabase.from("deals").update({ transfer_ref: reference }).eq("deal_id", dealId);
        await supabase.from("audit_logs").insert([{
          deal_id: dealId, action: "transfer_completed", actor: "paystack",
          details: { reference, amount: data.amount / 100 },
        }]);

        const { data: deal } = await supabase.from("deals").select("seller_telegram").eq("deal_id", dealId).maybeSingle();
        if (deal) {
          await notifyByUsername(deal.seller_telegram,
            `🏦 <b>Transfer Successful!</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🆔 Deal: <code>${dealId}</code>\n` +
            `💰 ₦${(data.amount / 100).toLocaleString()} has been deposited to your bank account.\n\n` +
            `Thank you for using TrustPay9ja! 🛡️`,
            { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
          );
        }

        console.log(`Transfer completed for deal ${dealId}`);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: corsHeaders });
  }
});

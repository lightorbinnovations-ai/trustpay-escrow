import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { validateTelegramWebAppData } from "../_shared/telegram-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-init-data",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

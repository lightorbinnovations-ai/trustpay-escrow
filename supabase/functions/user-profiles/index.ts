import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { validateTelegramWebAppData } from "../_shared/telegram-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-init-data",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Helper: Create Paystack Transfer Recipient
async function createPaystackRecipient(name: string, accountNumber: string, bankCode: string, secretKey: string) {
  const response = await fetch('https://api.paystack.co/transferrecipient', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: "nuban",
      name: name,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: "NGN"
    })
  });
  const data = await response.json();
  if (!response.ok || !data.status) {
    throw new Error(`Paystack error: ${data.message || 'Failed to create recipient'}`);
  }
  return data.data.recipient_code;
}

// Map Bank Names to Paystack Codes
const bankCodes: Record<string, string> = {
  "Access Bank": "044",
  "GTBank": "058",
  "First Bank": "011",
  "UBA": "033",
  "Zenith Bank": "057",
  "Kuda": "50211",
  "OPay": "999992",
  "PalmPay": "999991",
  "Moniepoint": "50515",
  "Wema Bank": "035",
  "Sterling Bank": "232",
  "Fidelity Bank": "070",
  "FCMB": "214",
  "Union Bank": "032",
  "Polaris Bank": "076",
  "Stanbic IBTC": "221",
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

    // 2. Parse Payload
    const { action, payload } = await req.json();

    if (action === "update_profile") {
      const { bank_name, account_number, account_name } = payload;

      let recipientCode = null;

      // Attempt Paystack Recipient Creation if all details are provided
      if (bank_name && account_number && account_name) {
        const code = bankCodes[bank_name];
        if (!code) throw new Error("Unsupported bank selected");

        const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
        if (paystackKey) {
          recipientCode = await createPaystackRecipient(account_name, account_number, code, paystackKey);
        }
      }

      const updateData = {
        telegram_id: tgUser.id,
        telegram_username: userTelegramTag,
        bank_name,
        account_number,
        account_name,
        ...(recipientCode && { paystack_recipient_code: recipientCode })
      };

      const { error: updateError } = await supabaseClient
        .from("user_profiles")
        .update(updateData)
        .eq("telegram_id", tgUser.id);

      if (updateError) {
        const { error: insertError } = await supabaseClient
          .from("user_profiles")
          .insert([updateData]);
        if (insertError) throw insertError;
      }

      return new Response(JSON.stringify({ success: true, recipientCode }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else if (action === "get_profile") {
      const { data, error } = await supabaseClient
        .from("user_profiles")
        .select("*")
        .eq("telegram_id", tgUser.id)
        .maybeSingle();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, profile: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else {
      throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

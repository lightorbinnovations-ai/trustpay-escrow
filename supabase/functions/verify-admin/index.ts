import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateTelegramWebAppData } from "../_shared/telegram-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-init-data",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const initData = req.headers.get("x-telegram-init-data");

    if (!initData || !botToken) {
      throw new Error("Missing authentication credentials");
    }

    // 1. Verify Telegram Identity
    const tgUser = validateTelegramWebAppData(initData, botToken);

    // 2. Check platform_settings for admin_telegram_id or admin_username
    const { data: settings } = await supabase.from("platform_settings").select("*");
    const settingsMap: Record<string, string> = {};
    settings?.forEach((s: any) => { settingsMap[s.key] = s.value; });

    const adminTelegramId = settingsMap["admin_telegram_id"];
    const adminUsername = settingsMap["admin_username"]?.toLowerCase().replace(/^@/, "");

    let authorized = false;

    if (adminTelegramId && String(tgUser.id) === String(adminTelegramId)) {
      authorized = true;
    } else if (adminUsername && tgUser.username && tgUser.username.toLowerCase() === adminUsername) {
      authorized = true;
    }

    return new Response(JSON.stringify({ authorized, user: tgUser }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ authorized: false, error: err.message }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

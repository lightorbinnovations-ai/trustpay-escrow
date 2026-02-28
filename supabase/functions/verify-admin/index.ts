import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { telegram_id, username } = await req.json();
    
    if (!telegram_id && !username) {
      return new Response(JSON.stringify({ authorized: false, error: "No credentials" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    
    // Check platform_settings for admin_telegram_id
    const { data: settings } = await supabase.from("platform_settings").select("*");
    const settingsMap: Record<string, string> = {};
    settings?.forEach((s: any) => { settingsMap[s.key] = s.value; });

    const adminTelegramId = settingsMap["admin_telegram_id"];
    const adminUsername = settingsMap["admin_username"]?.toLowerCase().replace(/^@/, "");
    
    let authorized = false;
    
    if (adminTelegramId && telegram_id && String(telegram_id) === String(adminTelegramId)) {
      authorized = true;
    } else if (adminUsername && username && username.toLowerCase().replace(/^@/, "") === adminUsername) {
      authorized = true;
    }

    return new Response(JSON.stringify({ authorized }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ authorized: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

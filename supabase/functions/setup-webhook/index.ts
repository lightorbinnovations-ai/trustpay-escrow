import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!TELEGRAM_BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not set" }), { status: 500, headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action || "all";

  const results: Record<string, any> = {};

  // Set webhook
  if (action === "all" || action === "set_webhook") {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-bot`;
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    results.webhook = await res.json();
  }

  // Set menu button (Open App at bottom-left of chat input)
  if (action === "all" || action === "set_menu_button") {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setChatMenuButton`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menu_button: {
          type: "web_app",
          text: "Open App",
          web_app: { url: "https://trustpay-escrow.vercel.app" },
        },
      }),
    });
    results.menu_button = await res.json();
  }

  // Set bot commands
  if (action === "all" || action === "set_commands") {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "start", description: "Start the bot & main menu" },
          { command: "newdeal", description: "Create a new escrow deal" },
          { command: "mydeals", description: "View your active deals" },
          { command: "help", description: "How escrow works" },
          { command: "register", description: "Register your bank account" },
        ],
      }),
    });
    results.commands = await res.json();
  }

  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LINE = "━━━━━━━━━━━━━━━━━━━━━━";
const THIN = "┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈";
const DOT = "·";

// Case-insensitive username comparison
function usernameMatch(a: string, b: string): boolean {
  return a.toLowerCase().replace(/^@/, "") === b.toLowerCase().replace(/^@/, "");
}

function statusEmoji(status: string): string {
  return { pending: "🟡", accepted: "🟠", funded: "🔵", completed: "🟢", disputed: "🔴" }[status] || "⚪";
}
function statusLabel(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function progressBar(status: string): string {
  return { pending: "▓░░░░░ Awaiting Seller", accepted: "▓▓░░░░ Awaiting Payment", funded: "▓▓▓░░░ In Progress", completed: "▓▓▓▓▓▓ Complete", disputed: "▓▓▓⚠░░ Disputed" }[status] || "░░░░░░";
}
function dealCard(d: any, role: string): string {
  const partner = role === "buyer" ? d.seller_telegram : d.buyer_telegram;
  const roleLabel = role === "buyer" ? "→ Seller" : "← Buyer";
  return (
    `┌─────────────────────┐\n` +
    `│ ${statusEmoji(d.status)} <b>${d.deal_id}</b>\n` +
    `│ 💰 ₦${d.amount.toLocaleString()} ${DOT} ${statusLabel(d.status)}\n` +
    `│ 📝 ${d.description}\n` +
    `│ ${roleLabel}: ${partner}\n` +
    `│ ${progressBar(d.status)}\n` +
    `└─────────────────────┘`
  );
}
function sanitizeInput(input: string, maxLen = 200) { return input.replace(/[<>&]/g, "").trim().substring(0, maxLen); }
function isValidUsername(u: string) { return /^[a-zA-Z0-9_]{3,32}$/.test(u); }

// Nigerian banks for Paystack
const BANKS = [
  { name: "Access Bank", code: "044" }, { name: "GTBank", code: "058" },
  { name: "First Bank", code: "011" }, { name: "UBA", code: "033" },
  { name: "Zenith Bank", code: "057" }, { name: "Kuda", code: "090267" },
  { name: "OPay", code: "999992" }, { name: "PalmPay", code: "999991" },
  { name: "Moniepoint", code: "50515" }, { name: "Wema Bank", code: "035" },
  { name: "Sterling Bank", code: "232" }, { name: "Fidelity Bank", code: "070" },
  { name: "FCMB", code: "214" }, { name: "Union Bank", code: "032" },
  { name: "Polaris Bank", code: "076" }, { name: "Stanbic IBTC", code: "221" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Create a secondary client to access the Market project database
    const marketSupabase = createClient(
      Deno.env.get("MARKET_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("MARKET_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const message = body.message || body.callback_query?.message;
    const callbackData = body.callback_query?.data;
    const chatId = message?.chat?.id;
    const text = message?.text;
    const fromUser = body.callback_query?.from || message?.from;
    const username = fromUser?.username || `user_${fromUser?.id}`;
    const firstName = fromUser?.first_name || "there";

    if (!chatId) return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });

    // --- Helpers ---
    async function sendMessage(chat: number, msg: string, replyMarkup?: unknown) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: msg, parse_mode: "HTML", disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
      });
    }
    async function sendPhoto(chat: number, photoUrl: string, caption: string, replyMarkup?: unknown) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, photo: photoUrl, caption, parse_mode: "HTML", ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
      });
    }
    async function answerCallback(id: string, text?: string) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: id, ...(text ? { text } : {}) }),
      });
    }

    // --- Upsert user profile ---
    async function ensureProfile(uname: string, chat: number) {
      const { data: existing } = await supabase.from("user_profiles").select("*").ilike("telegram_username", `@${uname}`).maybeSingle();
      if (!existing) {
        await supabase.from("user_profiles").insert({ telegram_username: `@${uname}`, telegram_chat_id: chat });
      } else if (!existing.telegram_chat_id || existing.telegram_chat_id !== chat) {
        await supabase.from("user_profiles").update({ telegram_chat_id: chat }).eq("id", existing.id);
      }
      return existing;
    }

    // --- Notify a user by their telegram username (case-insensitive) ---
    async function notifyUser(targetUsername: string, msg: string, replyMarkup?: unknown) {
      const { data: profile } = await supabase.from("user_profiles").select("telegram_chat_id").ilike("telegram_username", targetUsername).maybeSingle();
      if (profile?.telegram_chat_id) {
        await sendMessage(profile.telegram_chat_id, msg, replyMarkup);
        return true;
      }
      return false;
    }

    // --- Paystack Helpers ---
    async function createRecipient(name: string, accountNumber: string, bankCode: string): Promise<string | null> {
      const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
      if (!PAYSTACK_SECRET_KEY) return null;
      try {
        const res = await fetch("https://api.paystack.co/transferrecipient", {
          method: "POST",
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "nuban", name, account_number: accountNumber, bank_code: bankCode, currency: "NGN" }),
        });
        const data = await res.json();
        return data.status ? data.data.recipient_code : null;
      } catch (e) {
        console.error("createRecipient error:", e);
        return null;
      }
    }

    async function initiateTransfer(amount: number, recipientCode: string, reference: string, reason: string): Promise<boolean> {
      const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
      if (!PAYSTACK_SECRET_KEY) return false;
      try {
        const res = await fetch("https://api.paystack.co/transfer", {
          method: "POST",
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ source: "balance", amount: amount * 100, recipient: recipientCode, reason, metadata: { deal_id: reference } }),
        });
        const data = await res.json();
        return data.status === true;
      } catch (e) {
        console.error("initiateTransfer error:", e);
        return false;
      }
    }

    // --- Notify admin of every milestone ---
    async function notifyAdmin(event: string, details: string) {
      const { data: settings } = await supabase.from("platform_settings").select("*").in("key", ["admin_telegram_id", "admin_username"]);
      const settingsMap: Record<string, string> = {};
      settings?.forEach((s: any) => { settingsMap[s.key] = s.value; });

      let adminChatId: number | null = null;

      // Try admin_telegram_id first
      if (settingsMap["admin_telegram_id"]) {
        adminChatId = parseInt(settingsMap["admin_telegram_id"]);
        if (isNaN(adminChatId)) adminChatId = null;
      }

      // Fallback to admin_username lookup
      if (!adminChatId && settingsMap["admin_username"]) {
        const { data: adminProfile } = await supabase.from("user_profiles").select("telegram_chat_id")
          .ilike("telegram_username", `@${settingsMap["admin_username"].replace(/^@/, "")}`).maybeSingle();
        if (adminProfile?.telegram_chat_id) adminChatId = adminProfile.telegram_chat_id;
      }

      if (adminChatId) {
        await sendMessage(adminChatId,
          `🔔 <b>Admin Alert: ${event}</b>\n${LINE}\n\n${details}\n${LINE}`,
          { inline_keyboard: [[{ text: "🚀 Open Dashboard", web_app: { url: "https://trustpay-escrow.vercel.app" } }]] }
        );
      }
    }

    const webAppUrl = "https://trustpay-escrow.vercel.app";
    const mainMenuKeyboard = {
      inline_keyboard: [
        [{ text: "🚀 Open App", web_app: { url: webAppUrl } }],
        [{ text: "➕ New Deal", callback_data: "open_newdeal" }, { text: "📋 My Deals", callback_data: "open_mydeals" }],
        [{ text: "❓ Help Guide", callback_data: "open_help" }, { text: "🧹 Clear Chat", callback_data: "clear_chat" }],
      ],
    };

    // ═══════ Upsert bot_users on any interaction ═══════
    async function upsertBotUser(telegramId: number, fName: string, uname: string) {
      await supabase.from("bot_users").upsert({
        telegram_id: telegramId,
        first_name: fName,
        username: uname,
      }, { onConflict: "telegram_id" });
    }
    if (fromUser?.id) {
      await upsertBotUser(fromUser.id, firstName, username);
    }

    // ═══════ /start (with deep link support) ═══════
    if (text && text.startsWith("/start")) {
      const startParam = text.replace("/start", "").trim();

      // ─── Marketplace escrow: /start escrow_{listingId} ───
      if (startParam.startsWith("escrow_")) {
        const listingId = startParam.replace("escrow_", "");
        try {
          const { data: listing, error: listingErr } = await marketSupabase
            .from("listings").select("*").eq("id", listingId).maybeSingle();
          if (listingErr || !listing) {
            await sendMessage(chatId, `❌ Listing not found. Please check the link and try again.`, mainMenuKeyboard);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }


          if (listing.seller_telegram_id === fromUser?.id) {
            await sendMessage(chatId, `❌ You cannot buy your own listing.`, mainMenuKeyboard);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          // Check for existing pending transaction in MARKET database
          let { data: existingTx } = await marketSupabase.from("transactions").select("*")
            .eq("listing_id", listingId).eq("buyer_telegram_id", fromUser?.id).eq("status", "pending")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();


          if (!existingTx) {
            const { data: newTx, error: txErr } = await marketSupabase.from("transactions").insert({
              listing_id: listingId,
              buyer_telegram_id: fromUser?.id,
              seller_telegram_id: listing.seller_telegram_id,
              amount: listing.price,
              status: "pending",
            }).select().single();

            if (txErr) {
              console.error("Transaction create error:", txErr);
              await sendMessage(chatId, `❌ Failed to create transaction. Please try again.`, mainMenuKeyboard);
              return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
            }
            existingTx = newTx;
          }

          // Get seller info from MARKET database
          const { data: sellerUser } = await marketSupabase.from("bot_users").select("first_name, username")
            .eq("telegram_id", listing.seller_telegram_id).maybeSingle();

          const sellerName = sellerUser?.username ? `@${sellerUser.username}` : (sellerUser?.first_name || `User ${listing.seller_telegram_id}`);

          const amount = Number(listing.price);
          const fee = Math.max(300, Math.round(amount * 0.05));
          const sellerReceives = amount - fee;

          await sendMessage(chatId,
            `🛒 <b>Escrow Payment</b>\n${LINE}\n\n` +
            `┌─────────────────────┐\n` +
            `│ 📝 <b>${listing.title}</b>\n` +
            `│ 💰 Price: ₦${amount.toLocaleString()}\n` +
            `│ 💵 Fee:   ₦${fee.toLocaleString()}\n` +
            `│ 📤 Seller gets: ₦${sellerReceives.toLocaleString()}\n` +
            `│ 👤 Seller: ${sellerName}\n` +
            (listing.category ? `│ 📂 ${listing.category}\n` : "") +
            (listing.city ? `│ 📍 ${listing.city}\n` : "") +
            `└─────────────────────┘\n\n` +
            `🔒 Funds will be held in escrow until you confirm delivery.\n` +
            `👇 <b>Confirm to pay:</b>\n${LINE}`,
            {
              inline_keyboard: [
                [{ text: `✅ Confirm & Pay ₦${amount.toLocaleString()}`, callback_data: `mkt_pay_${existingTx.id}` }],
                [{ text: "❌ Cancel", callback_data: "open_start" }],
              ]
            }
          );
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        } catch (e) {
          console.error("Escrow deep link error:", e);
          await sendMessage(chatId, `❌ Something went wrong. Please try again.`, mainMenuKeyboard);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
      }

      // ─── Marketplace listing preview: /start listing_{listingId} ───
      if (startParam.startsWith("listing_")) {
        const listingId = startParam.replace("listing_", "");
        try {
          const { data: listing } = await supabase
            .from("listings").select("*").eq("id", listingId).maybeSingle();
          if (!listing) {
            await sendMessage(chatId, `❌ Listing not found.`, mainMenuKeyboard);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          const { data: sellerUser } = await supabase.from("bot_users").select("first_name, username")
            .eq("telegram_id", listing.seller_telegram_id).maybeSingle();
          const sellerName = sellerUser?.username ? `@${sellerUser.username}` : (sellerUser?.first_name || `User ${listing.seller_telegram_id}`);

          await sendMessage(chatId,
            `📦 <b>${listing.title}</b>\n${LINE}\n\n` +
            `${listing.description || "No description"}\n\n` +
            `💰 Price: ₦${Number(listing.price).toLocaleString()}\n` +
            `👤 Seller: ${sellerName}\n` +
            (listing.category ? `📂 ${listing.category}\n` : "") +
            (listing.city ? `📍 ${listing.city}\n` : "") +
            `\n${LINE}`,
            {
              inline_keyboard: [
                [{ text: `🛒 Buy with Escrow`, callback_data: `mkt_escrow_${listing.id}` }],
                [{ text: "🔙 Menu", callback_data: "open_start" }],
              ]
            }
          );
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        } catch (e) {
          console.error("Listing deep link error:", e);
          await sendMessage(chatId, `❌ Something went wrong.`, mainMenuKeyboard);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
      }

      // Deep link from marketplace: /start deal_BASE64
      if (startParam.startsWith("deal_")) {
        try {
          const encoded = startParam.replace("deal_", "");
          const decoded = atob(encoded);
          // Format: seller|amount|description|productId|imageUrl
          const parts = decoded.split("|");
          const [dlSeller, dlAmount, dlDescription, dlProductId, dlImageUrl] = parts;

          if (!dlSeller || !dlAmount || !dlDescription) {
            await sendMessage(chatId, `❌ Invalid marketplace link. Please try again.`, mainMenuKeyboard);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          const amt = parseInt(dlAmount);
          if (isNaN(amt) || amt < 100 || amt > 20000) {
            await sendMessage(chatId, `❌ Invalid amount in marketplace link (₦100 – ₦20,000).`, mainMenuKeyboard);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          const cleanSeller = dlSeller.replace(/^@/, "");
          if (cleanSeller.toLowerCase() === username.toLowerCase()) {
            await sendMessage(chatId, `❌ You cannot create a deal with yourself.`, mainMenuKeyboard);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          const fee = Math.max(300, Math.round(amt * 0.05));
          const sellerReceives = amt - fee;
          const cleanDesc = sanitizeInput(dlDescription);

          await sendMessage(chatId,
            `🛒 <b>Marketplace Escrow Deal</b>\n${LINE}\n\n` +
            `┌─────────────────────┐\n` +
            `│ 📝 ${cleanDesc}\n` +
            `│ 👤 Seller: @${cleanSeller}\n│\n` +
            `│ 💰 Amount:     ₦${amt.toLocaleString()}\n` +
            `│ 💵 Fee (5%):   ₦${fee.toLocaleString()}\n` +
            `│ 📤 Seller gets: ₦${sellerReceives.toLocaleString()}\n` +
            (dlProductId ? `│ 🏷️ Product ID: ${dlProductId}\n` : "") +
            `└─────────────────────┘\n\n` +
            `👇 <b>Confirm to create this escrow deal:</b>\n${LINE}`,
            {
              inline_keyboard: [
                [{ text: "✅ Create Escrow Deal", callback_data: `mkdeal_${encoded}` }],
                [{ text: "❌ Cancel", callback_data: "open_start" }],
              ]
            }
          );
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        } catch (e) {
          console.error("Deep link parse error:", e);
          await sendMessage(chatId, `❌ Invalid marketplace link. Please ask the seller for a new link.`, mainMenuKeyboard);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
      }

      // Normal /start — branded welcome with banner image
      const welcomeCaption =
        `Hey <b>${firstName}</b>! 👋 Welcome to <b>TrustPay Escrow</b>\n\n` +
        `🛡️ Your safe escrow service on Telegram\n\n` +
        `Buy & sell with confidence — your payments are held securely until delivery is confirmed.\n\n` +
        `Tap a button below to get started 👇`;

      // Use a branded banner image
      const bannerUrl = "https://trustpayescrow.lovable.app/images/bot-banner.png";

      try {
        await sendPhoto(chatId, bannerUrl, welcomeCaption, {
          inline_keyboard: [
            [{ text: "🚀 Open App", web_app: { url: webAppUrl } }],
            [{ text: "➕ New Deal", callback_data: "open_newdeal" }, { text: "📋 My Deals", callback_data: "open_mydeals" }],
            [{ text: "👤 My Profile", callback_data: "open_settings" }, { text: "❓ Help", callback_data: "open_help" }],
          ],
        });
      } catch {
        // Fallback to text if photo fails
        await sendMessage(chatId, welcomeCaption, mainMenuKeyboard);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // ═══════ /help ═══════
    if (text === "/help") {
      await sendMessage(chatId,
        `📖 <b>TrustPay9ja — User Guide</b>\n${LINE}\n\n<b>🔄 How Escrow Works:</b>\n\n` +
        `┌ 1️⃣ <b>Create Deal</b> → Buyer sends <code>@seller 5000 item</code>\n` +
        `├ 2️⃣ <b>Seller Accepts</b> → Seller confirms the deal\n` +
        `├ 3️⃣ <b>Buyer Pays</b> → Funds held in escrow\n` +
        `├ 4️⃣ <b>Seller Delivers</b> → Marks "Delivered"\n` +
        `├ 5️⃣ <b>Buyer Confirms</b> → Clicks "✅ Received"\n` +
        `└ 6️⃣ <b>Seller Paid!</b> → 95% sent to bank 🎉\n\n` +
        `${THIN}\n<b>❌ Cancellation:</b>\n` +
        `• <b>Before acceptance</b> — Buyer/seller can cancel free\n` +
        `• <b>Within 1 hour</b> of payment — Auto-refund\n` +
        `• <b>After 1 hour</b> — Open a dispute for admin review\n\n` +
        `⚠️ <b>Protection:</b> Dispute if wrong ${DOT} 48h auto-release\n💰 Max: ₦20,000 ${DOT} Fee: 5% (min ₦300)\n${LINE}`,
        { inline_keyboard: [[{ text: "➕ New Deal", callback_data: "open_newdeal" }, { text: "📋 My Deals", callback_data: "open_mydeals" }], [{ text: "🔙 Back to Menu", callback_data: "open_start" }]] }
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // ═══════ /setbank ═══════
    if (text && text.startsWith("/setbank")) {
      const parts = text.split(" ");
      if (parts.length < 4) {
        await sendMessage(chatId,
          `❌ <b>Invalid Format</b>\n${LINE}\n\n` +
          `Please use the format:\n<code>/setbank BankName AccountNumber Your Full Name</code>\n\n` +
          `💡 Example: <code>/setbank GTBank 0123456789 John Doe</code>\n\n` +
          `<b>Supported Banks:</b>\n${BANKS.map(b => `• ${b.name}`).join("\n")}`,
          { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "open_start" }]] }
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const bankName = parts[1].toLowerCase();
      const accountNumber = parts[2];
      const accountName = parts.slice(3).join(" ");

      const bank = BANKS.find(b => b.name.toLowerCase().includes(bankName) || bankName.includes(b.name.toLowerCase().split(" ")[0]));

      if (!bank) {
        await sendMessage(chatId,
          `❌ <b>Bank Not Supported</b>\n${LINE}\n\nWe couldn't find "${parts[1]}".\n\n` +
          `<b>Supported Banks:</b>\n${BANKS.map(b => `• ${b.name}`).join("\n")}`,
          { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "open_start" }]] }
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      if (!/^\d{10}$/.test(accountNumber)) {
        await sendMessage(chatId, `❌ <b>Invalid Account Number</b>\n${LINE}\n\nPlease enter a valid 10-digit NUBAN account number.`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      await sendMessage(chatId, `⏳ <i>Verifying bank details with Paystack...</i>`);

      const recipientCode = await createRecipient(sanitizeInput(accountName), accountNumber, bank.code);

      if (recipientCode) {
        await ensureProfile(username, chatId);
        await supabase.from("user_profiles").update({
          bank_name: bank.name,
          account_number: accountNumber,
          account_name: accountName,
          paystack_recipient_code: recipientCode
        }).ilike("telegram_username", `@${username}`);

        await sendMessage(chatId,
          `✅ <b>Bank Account Registered!</b>\n${LINE}\n\n` +
          `🏦 Bank: ${bank.name}\n` +
          `🔢 Account: ${accountNumber}\n` +
          `👤 Name: ${accountName}\n\n` +
          `Your payouts will now be sent automatically to this account! 🎉\n${LINE}`,
          { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }, { text: "🔙 Menu", callback_data: "open_start" }]] }
        );
      } else {
        await sendMessage(chatId,
          `❌ <b>Verification Failed</b>\n${LINE}\n\nWe couldn't verify this account with Paystack.\nPlease check the details and try again.`,
          { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "open_start" }]] }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // ═══════ /newdeal ═══════
    if (text === "/newdeal") {
      await sendMessage(chatId,
        `➕ <b>Create New Deal</b>\n${LINE}\n\n📝 Send your deal in this format:\n\n<code>@seller_username amount description</code>\n\n${THIN}\n💡 <b>Example:</b>\n<code>@john_doe 5000 iPhone 14 case</code>\n\nFee: ₦300 ${DOT} Seller gets: ₦4,700\n${LINE}`,
        { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "open_start" }]] }
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // ═══════ /mydeals ═══════
    if (text === "/mydeals") {
      const uname = `@${username}`;
      const { data: deals } = await supabase.from("deals").select("*")
        .or(`buyer_telegram.ilike.${uname},seller_telegram.ilike.${uname}`)
        .order("created_at", { ascending: false }).limit(5);

      if (!deals || deals.length === 0) {
        await sendMessage(chatId, `📋 <b>My Deals</b>\n${LINE}\n\n📭 You have no deals yet.\n${LINE}`,
          { inline_keyboard: [[{ text: "➕ Create First Deal", callback_data: "open_newdeal" }], [{ text: "🔙 Back to Menu", callback_data: "open_start" }]] });
      } else {
        const role = (d: any) => usernameMatch(d.buyer_telegram, uname) ? "buyer" : "seller";
        const cards = deals.map((d: any) => dealCard(d, role(d))).join("\n\n");
        const actionButtons: any[] = [];

        for (const d of deals.filter((d: any) => d.status === "pending" && usernameMatch(d.seller_telegram, uname))) {
          actionButtons.push([
            { text: `✅ Accept: ${d.deal_id}`, callback_data: `accept_pending_${d.deal_id}` },
            { text: `🚫 Decline: ${d.deal_id}`, callback_data: `decline_pending_${d.deal_id}` },
          ]);
        }
        for (const d of deals.filter((d: any) => d.status === "pending" && usernameMatch(d.buyer_telegram, uname))) {
          actionButtons.push([{ text: `❌ Cancel: ${d.deal_id}`, callback_data: `cancel_pending_${d.deal_id}` }]);
        }
        for (const d of deals.filter((d: any) => d.status === "accepted" && usernameMatch(d.buyer_telegram, uname))) {
          actionButtons.push([{ text: `💳 Pay: ${d.deal_id}`, callback_data: `pay_${d.deal_id}` }]);
        }
        for (const d of deals.filter((d: any) => d.status === "funded" && usernameMatch(d.seller_telegram, uname) && !d.delivered_at)) {
          actionButtons.push([{ text: `📦 Mark Delivered: ${d.deal_id}`, callback_data: `delivered_${d.deal_id}` }]);
        }
        for (const d of deals.filter((d: any) => d.status === "funded" && usernameMatch(d.buyer_telegram, uname) && d.delivered_at)) {
          actionButtons.push([{ text: `✅ Received: ${d.deal_id}`, callback_data: `received_${d.deal_id}` }, { text: `⚠️ Dispute`, callback_data: `dispute_${d.deal_id}` }]);
        }
        for (const d of deals.filter((d: any) => d.status === "funded" && usernameMatch(d.buyer_telegram, uname) && !d.delivered_at)) {
          const fundedAt = new Date(d.funded_at).getTime();
          const hoursSinceFunded = (Date.now() - fundedAt) / 3600000;
          const cancelBtn = hoursSinceFunded <= 1
            ? { text: `❌ Cancel`, callback_data: `cancel_funded_${d.deal_id}` }
            : { text: `⚠️ Dispute`, callback_data: `dispute_${d.deal_id}` };
          actionButtons.push([cancelBtn]);
        }

        await sendMessage(chatId, `📋 <b>My Deals</b> (${deals.length})\n${LINE}\n\n${cards}\n\n${LINE}`,
          { inline_keyboard: [...actionButtons, [{ text: "➕ New Deal", callback_data: "open_newdeal" }, { text: "🔄 Refresh", callback_data: "open_mydeals" }], [{ text: "🔙 Menu", callback_data: "open_start" }]] });
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // ═══════ /register ═══════
    if (text === "/register") {
      await sendMessage(chatId,
        `🏦 <b>Register Bank Account</b>\n${LINE}\n\nTo receive payments, send your bank details:\n\n<code>/setbank BankName AccountNumber AccountName</code>\n\n${THIN}\n💡 <b>Example:</b>\n<code>/setbank GTBank 0123456789 John Doe</code>\n\n${THIN}\n<b>Supported Banks:</b>\n${BANKS.map(b => `• ${b.name}`).join("\n")}\n${LINE}`,
        { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "open_start" }]] }
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // ═══════ /setbank ═══════
    if (text && text.startsWith("/setbank ")) {
      const parts = text.replace("/setbank ", "").trim();
      const match = parts.match(/^(\S+(?:\s+\S+)?)\s+(\d{10})\s+(.+)$/);
      if (!match) {
        await sendMessage(chatId,
          `❌ <b>Invalid Format</b>\n${THIN}\n\nUse: <code>/setbank BankName 0123456789 Your Name</code>\n\nAccount number must be exactly 10 digits.`,
          { inline_keyboard: [[{ text: "🔄 Try Again", callback_data: "open_register" }]] }
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const [, bankNameInput, accountNumber, accountName] = match;
      const bankNameClean = bankNameInput.toLowerCase().replace(/\s+/g, "");
      const bank = BANKS.find(b => b.name.toLowerCase().replace(/\s+/g, "").includes(bankNameClean) || bankNameClean.includes(b.name.toLowerCase().replace(/\s+/g, "")));

      if (!bank) {
        await sendMessage(chatId,
          `❌ <b>Unknown Bank</b>\n${THIN}\n\nSupported banks:\n${BANKS.map(b => `• ${b.name}`).join("\n")}`,
          { inline_keyboard: [[{ text: "🔄 Try Again", callback_data: "open_register" }]] }
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const recipientCode = await createRecipient(sanitizeInput(accountName), accountNumber, bank.code);

      await supabase.from("user_profiles").update({
        bank_name: bank.name, account_number: accountNumber,
        account_name: sanitizeInput(accountName), paystack_recipient_code: recipientCode,
      }).ilike("telegram_username", `@${username}`);

      await sendMessage(chatId,
        `✅ <b>Bank Account Saved!</b>\n${LINE}\n\n` +
        `🏦 Bank: <b>${bank.name}</b>\n💳 Account: <code>${accountNumber}</code>\n👤 Name: <b>${sanitizeInput(accountName)}</b>\n` +
        (recipientCode ? `✅ Verified with payment provider\n` : `⚠️ Could not verify — admin will process manually\n`) +
        `\n${LINE}`,
        mainMenuKeyboard
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // ═══════ Deal creation: @seller amount desc ═══════
    if (text && text.startsWith("@")) {
      const parts = text.match(/^@(\S+)\s+(\d+)\s+(.+)$/);
      if (!parts) {
        await sendMessage(chatId, `❌ <b>Invalid Format</b>\n${THIN}\n\nUse: <code>@seller_username amount description</code>\n\nExample: <code>@john_doe 5000 iPhone case</code>`,
          { inline_keyboard: [[{ text: "❓ See Help", callback_data: "open_help" }]] });
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const [, sellerUsername, amountStr, rawDescription] = parts;
      const amount = parseInt(amountStr);
      const description = sanitizeInput(rawDescription);

      if (!isValidUsername(sellerUsername)) {
        await sendMessage(chatId, `❌ <b>Invalid Username</b>\n${THIN}\n\n3-32 chars (letters, numbers, underscores)`,
          { inline_keyboard: [[{ text: "🔄 Try Again", callback_data: "open_newdeal" }]] });
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      if (isNaN(amount) || amount < 100 || amount > 20000) {
        await sendMessage(chatId, `❌ <b>Invalid Amount</b>\n${THIN}\n\nAmount must be ₦100 — ₦20,000`,
          { inline_keyboard: [[{ text: "🔄 Try Again", callback_data: "open_newdeal" }]] });
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      if (sellerUsername.toLowerCase() === username.toLowerCase()) {
        await sendMessage(chatId, `❌ You cannot create a deal with yourself.`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      if (description.length < 3) {
        await sendMessage(chatId, `❌ <b>Too Short</b>\n${THIN}\n\nDescription must be at least 3 characters.`,
          { inline_keyboard: [[{ text: "🔄 Try Again", callback_data: "open_newdeal" }]] });
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const fee = Math.max(300, Math.round(amount * 0.05));
      const sellerReceives = amount - fee;
      const dealId = `ESC-${Date.now().toString(36).toUpperCase()}`;

      // Prevent duplicates (case-insensitive)
      const uname = `@${username}`;
      const { data: recentDeals } = await supabase.from("deals").select("deal_id")
        .ilike("buyer_telegram", uname).ilike("seller_telegram", `@${sellerUsername}`)
        .eq("amount", amount).eq("status", "pending")
        .gte("created_at", new Date(Date.now() - 60000).toISOString());

      if (recentDeals && recentDeals.length > 0) {
        await sendMessage(chatId, `⚠️ <b>Duplicate Deal</b>\n${THIN}\n\nYou already have a similar pending deal.`,
          { inline_keyboard: [[{ text: "📋 View My Deals", callback_data: "open_mydeals" }]] });
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { error } = await supabase.from("deals").insert({
        deal_id: dealId, buyer_telegram: `@${username}`, seller_telegram: `@${sellerUsername}`,
        amount, fee, description, status: "pending",
      });

      if (error) {
        console.error("Deal creation error:", error);
        await sendMessage(chatId, `❌ Failed to create deal. Please try again.`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      await supabase.from("audit_logs").insert([{
        deal_id: dealId, action: "deal_created", actor: `@${username}`,
        details: { amount, seller: `@${sellerUsername}`, description },
      }]);

      // ✅ Notify BUYER — deal created, waiting for seller to accept
      await sendMessage(chatId,
        `✅ <b>Deal Created!</b>\n${LINE}\n\n` +
        `┌─────────────────────┐\n` +
        `│ 🆔 <code>${dealId}</code>\n│\n` +
        `│ 📝 ${description}\n` +
        `│ 👤 Seller: @${sellerUsername}\n│\n` +
        `│ ${THIN}\n` +
        `│ 💰 Amount:     ₦${amount.toLocaleString()}\n` +
        `│ 💵 Fee (5%):   ₦${fee.toLocaleString()}\n` +
        `│ 📤 Seller gets: ₦${sellerReceives.toLocaleString()}\n` +
        `│ ${THIN}\n│\n` +
        `│ ${progressBar("pending")}\n` +
        `└─────────────────────┘\n\n` +
        `⏳ <b>Waiting for seller to accept this deal.</b>\nYou'll be notified once they accept so you can proceed to pay.`,
        { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }, { text: "🔙 Menu", callback_data: "open_start" }]] }
      );

      // ✅ Notify SELLER — accept or decline
      const sellerNotified = await notifyUser(`@${sellerUsername}`,
        `📩 <b>New Deal Request!</b>\n${LINE}\n\n` +
        `┌─────────────────────┐\n` +
        `│ 🆔 <code>${dealId}</code>\n│\n` +
        `│ 📝 ${description}\n` +
        `│ 👤 Buyer: @${username}\n│\n` +
        `│ 💰 Amount: ₦${amount.toLocaleString()}\n` +
        `│ 📤 You'll receive: ₦${sellerReceives.toLocaleString()}\n│\n` +
        `│ 🟡 Status: Awaiting Your Acceptance\n` +
        `└─────────────────────┘\n\n` +
        `👇 <b>Accept or decline this deal:</b>\n${LINE}`,
        {
          inline_keyboard: [
            [{ text: "✅ Accept Deal", callback_data: `accept_pending_${dealId}` }, { text: "🚫 Decline", callback_data: `decline_pending_${dealId}` }],
            [{ text: "📋 My Deals", callback_data: "open_mydeals" }],
          ]
        }
      );

      if (!sellerNotified) {
        await sendMessage(chatId,
          `ℹ️ <b>Note:</b> The seller (@${sellerUsername}) hasn't started this bot yet.\nAsk them to open @TrustPay9jaBot and send /start so they can receive notifications.`
        );
      }

      // 🔔 Admin notification
      await notifyAdmin("New Deal Created",
        `🆔 <code>${dealId}</code>\n👤 Buyer: @${username}\n👤 Seller: @${sellerUsername}\n💰 Amount: ₦${amount.toLocaleString()}\n📝 ${description}`
      );

      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // ═══════ Callback queries ═══════
    if (callbackData) {
      const callbackQueryId = body.callback_query.id;
      const callbackChatId = body.callback_query.message.chat.id;
      const callbackUser = body.callback_query.from.username || `user_${body.callback_query.from.id}`;
      const callbackFirstName = body.callback_query.from.first_name || "there";

      await answerCallback(callbackQueryId);
      await ensureProfile(callbackUser, callbackChatId);

      // --- Marketplace deep link deal creation ---
      if (callbackData.startsWith("mkdeal_")) {
        const encoded = callbackData.replace("mkdeal_", "");
        try {
          const decoded = atob(encoded);
          const parts = decoded.split("|");
          const [dlSeller, dlAmount, dlDescription, dlProductId] = parts;
          const cleanSeller = dlSeller.replace(/^@/, "");
          const amt = parseInt(dlAmount);
          const fee = Math.max(300, Math.round(amt * 0.05));
          const sellerReceives = amt - fee;
          const dealId = `MKT-${Date.now().toString(36).toUpperCase()}`;
          const cleanDesc = sanitizeInput(dlDescription + (dlProductId ? ` [${dlProductId}]` : ""));

          if (cleanSeller.toLowerCase() === callbackUser.toLowerCase()) {
            await sendMessage(callbackChatId, `❌ You cannot create a deal with yourself.`, mainMenuKeyboard);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          // Duplicate check
          const uname = `@${callbackUser}`;
          const { data: recentDeals } = await supabase.from("deals").select("deal_id")
            .ilike("buyer_telegram", uname).ilike("seller_telegram", `@${cleanSeller}`)
            .eq("amount", amt).eq("status", "pending")
            .gte("created_at", new Date(Date.now() - 60000).toISOString());
          if (recentDeals && recentDeals.length > 0) {
            await sendMessage(callbackChatId, `⚠️ You already have a similar pending deal.`, { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] });
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          const { error } = await supabase.from("deals").insert({
            deal_id: dealId, buyer_telegram: `@${callbackUser}`, seller_telegram: `@${cleanSeller}`,
            amount: amt, fee, description: cleanDesc, status: "pending",
          });
          if (error) {
            await sendMessage(callbackChatId, `❌ Failed to create deal. Please try again.`);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          await supabase.from("audit_logs").insert([{
            deal_id: dealId, action: "deal_created", actor: `@${callbackUser}`,
            details: { amount: amt, seller: `@${cleanSeller}`, description: cleanDesc, source: "marketplace" },
          }]);

          await sendMessage(callbackChatId,
            `✅ <b>Marketplace Deal Created!</b>\n${LINE}\n\n` +
            `🆔 <code>${dealId}</code>\n📝 ${cleanDesc}\n👤 Seller: @${cleanSeller}\n` +
            `💰 ₦${amt.toLocaleString()} · Fee: ₦${fee.toLocaleString()}\n\n` +
            `⏳ Waiting for seller to accept...\n${LINE}`,
            { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
          );

          await notifyUser(`@${cleanSeller}`,
            `📩 <b>New Marketplace Deal!</b>\n${LINE}\n\n` +
            `🆔 <code>${dealId}</code>\n📝 ${cleanDesc}\n👤 Buyer: @${callbackUser}\n` +
            `💰 ₦${amt.toLocaleString()} · You receive: ₦${sellerReceives.toLocaleString()}\n\n` +
            `👇 Accept or decline:\n${LINE}`,
            {
              inline_keyboard: [
                [{ text: "✅ Accept", callback_data: `accept_pending_${dealId}` }, { text: "🚫 Decline", callback_data: `decline_pending_${dealId}` }],
              ]
            }
          );

          await notifyAdmin("Marketplace Deal Created",
            `🛒 Source: TrustPay Market\n🆔 <code>${dealId}</code>\n👤 Buyer: @${callbackUser}\n👤 Seller: @${cleanSeller}\n💰 ₦${amt.toLocaleString()}\n📝 ${cleanDesc}`
          );

          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        } catch (e) {
          console.error("Marketplace deal error:", e);
          await sendMessage(callbackChatId, `❌ Failed to create marketplace deal.`, mainMenuKeyboard);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
      }

      // --- Back to Start ---
      if (callbackData === "open_start") {
        await sendMessage(callbackChatId,
          `🛡️ <b>TrustPay9ja</b>\n${LINE}\n\nHey <b>${callbackFirstName}</b>! 👋\nWhat would you like to do?\n${LINE}`,
          mainMenuKeyboard
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // --- Help ---
      if (callbackData === "open_help") {
        await sendMessage(callbackChatId,
          `📖 <b>TrustPay9ja — User Guide</b>\n${LINE}\n\n<b>🔄 How Escrow Works:</b>\n\n` +
          `┌ 1️⃣ <b>Create</b> → Buyer sends <code>@seller 5000 item</code>\n` +
          `├ 2️⃣ <b>Seller Accepts</b> → Confirms the deal\n` +
          `├ 3️⃣ <b>Buyer Pays</b> → Click "💳 Pay Now"\n` +
          `├ 4️⃣ <b>Seller Delivers</b> → Marks "📦 Delivered"\n` +
          `├ 5️⃣ <b>Buyer Confirms</b> → Clicks "✅ Received"\n` +
          `└ 6️⃣ <b>Seller Paid!</b> → 95% to bank 🎉\n\n` +
          `${THIN}\n<b>❌ Cancellation:</b>\n` +
          `• <b>Before acceptance</b> — Cancel free (buyer or seller)\n` +
          `• <b>Within 1 hour</b> of payment — Auto-refund\n` +
          `• <b>After 1 hour</b> — Dispute for admin review\n\n` +
          `🛡️ Dispute ${DOT} ⏰ 48h auto-release ${DOT} 🔐 Secure\n💰 Max: ₦20,000 ${DOT} Fee: 5% (min ₦300)\n${LINE}`,
          { inline_keyboard: [[{ text: "➕ New Deal", callback_data: "open_newdeal" }, { text: "📋 My Deals", callback_data: "open_mydeals" }], [{ text: "🏦 Register Bank", callback_data: "open_register" }], [{ text: "🔙 Back to Menu", callback_data: "open_start" }]] }
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // --- New Deal ---
      if (callbackData === "open_newdeal") {
        await sendMessage(callbackChatId,
          `➕ <b>Create New Deal</b>\n${LINE}\n\n📝 Send:\n\n<code>@seller_username amount description</code>\n\n${THIN}\n💡 Example: <code>@john_doe 5000 iPhone 14 case</code>\nFee: ₦300 ${DOT} Seller gets: ₦4,700\n${LINE}`,
          { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "open_start" }]] }
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // --- Register Bank ---
      if (callbackData === "open_register") {
        await sendMessage(callbackChatId,
          `🏦 <b>Register Bank Account</b>\n${LINE}\n\nSend your bank details:\n\n<code>/setbank BankName 0123456789 Your Full Name</code>\n\n${THIN}\n💡 Example: <code>/setbank GTBank 0123456789 John Doe</code>\n\n<b>Supported Banks:</b>\n${BANKS.map(b => `• ${b.name}`).join("\n")}\n${LINE}`,
          { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "open_start" }]] }
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // --- My Deals ---
      if (callbackData === "open_mydeals") {
        const uname = `@${callbackUser}`;
        const { data: deals } = await supabase.from("deals").select("*")
          .or(`buyer_telegram.ilike.${uname},seller_telegram.ilike.${uname}`)
          .order("created_at", { ascending: false }).limit(5);

        if (!deals || deals.length === 0) {
          await sendMessage(callbackChatId, `📋 <b>My Deals</b>\n${LINE}\n\n📭 No deals yet.\n${LINE}`,
            { inline_keyboard: [[{ text: "➕ Create First Deal", callback_data: "open_newdeal" }], [{ text: "🔙 Menu", callback_data: "open_start" }]] });
        } else {
          const role = (d: any) => usernameMatch(d.buyer_telegram, uname) ? "buyer" : "seller";
          const cards = deals.map((d: any) => dealCard(d, role(d))).join("\n\n");
          const actionButtons: any[] = [];

          for (const d of deals.filter((d: any) => d.status === "pending" && usernameMatch(d.seller_telegram, uname))) {
            actionButtons.push([
              { text: `✅ Accept: ${d.deal_id}`, callback_data: `accept_pending_${d.deal_id}` },
              { text: `🚫 Decline: ${d.deal_id}`, callback_data: `decline_pending_${d.deal_id}` },
            ]);
          }
          for (const d of deals.filter((d: any) => d.status === "pending" && usernameMatch(d.buyer_telegram, uname))) {
            actionButtons.push([{ text: `❌ Cancel: ${d.deal_id}`, callback_data: `cancel_pending_${d.deal_id}` }]);
          }
          for (const d of deals.filter((d: any) => d.status === "accepted" && usernameMatch(d.buyer_telegram, uname))) {
            actionButtons.push([{ text: `💳 Pay: ${d.deal_id}`, callback_data: `pay_${d.deal_id}` }]);
          }
          for (const d of deals.filter((d: any) => d.status === "funded" && usernameMatch(d.seller_telegram, uname) && !d.delivered_at)) {
            actionButtons.push([{ text: `📦 Mark Delivered: ${d.deal_id}`, callback_data: `delivered_${d.deal_id}` }]);
          }
          for (const d of deals.filter((d: any) => d.status === "funded" && usernameMatch(d.buyer_telegram, uname) && d.delivered_at)) {
            actionButtons.push([{ text: `✅ Received: ${d.deal_id}`, callback_data: `received_${d.deal_id}` }, { text: `⚠️ Dispute`, callback_data: `dispute_${d.deal_id}` }]);
          }
          for (const d of deals.filter((d: any) => d.status === "funded" && usernameMatch(d.buyer_telegram, uname) && !d.delivered_at)) {
            const fundedAt = new Date(d.funded_at).getTime();
            const hoursSinceFunded = (Date.now() - fundedAt) / 3600000;
            const cancelBtn = hoursSinceFunded <= 1
              ? { text: `❌ Cancel`, callback_data: `cancel_funded_${d.deal_id}` }
              : { text: `⚠️ Dispute`, callback_data: `dispute_${d.deal_id}` };
            actionButtons.push([cancelBtn]);
          }

          await sendMessage(callbackChatId, `📋 <b>My Deals</b> (${deals.length})\n${LINE}\n\n${cards}\n\n${LINE}`,
            { inline_keyboard: [...actionButtons, [{ text: "➕ New Deal", callback_data: "open_newdeal" }, { text: "🔄 Refresh", callback_data: "open_mydeals" }], [{ text: "🔙 Menu", callback_data: "open_start" }]] });
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // ═══════ SELLER ACCEPTS DEAL ═══════
      if (callbackData.startsWith("accept_pending_")) {
        const dealId = callbackData.replace("accept_pending_", "");
        const { data: deal } = await supabase.from("deals").select("*").eq("deal_id", dealId).single();

        if (!deal || deal.status !== "pending") {
          await sendMessage(callbackChatId, `❌ This deal cannot be accepted.`, { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        if (!usernameMatch(`@${callbackUser}`, deal.seller_telegram)) {
          await sendMessage(callbackChatId, `❌ Only the seller can accept this deal.`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        // Update status to accepted
        await supabase.from("deals").update({ status: "accepted" }).eq("deal_id", dealId);
        await supabase.from("audit_logs").insert([{
          deal_id: dealId, action: "deal_accepted", actor: `@${callbackUser}`,
          details: { amount: deal.amount, buyer: deal.buyer_telegram },
        }]);

        const sellerAmount = deal.amount - deal.fee;

        // Notify seller
        await sendMessage(callbackChatId,
          `✅ <b>Deal Accepted!</b>\n${LINE}\n\n` +
          `🆔 <code>${dealId}</code>\n📝 ${deal.description}\n👤 Buyer: ${deal.buyer_telegram}\n💰 You'll receive: ₦${sellerAmount.toLocaleString()}\n\n` +
          `⏳ Waiting for buyer to make payment...\n${LINE}`,
          { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
        );

        // Notify buyer — they can now pay
        await notifyUser(deal.buyer_telegram,
          `🎉 <b>Seller Accepted Your Deal!</b>\n${LINE}\n\n` +
          `┌─────────────────────┐\n` +
          `│ 🆔 <code>${dealId}</code>\n` +
          `│ 📝 ${deal.description}\n` +
          `│ 👤 Seller: ${deal.seller_telegram}\n` +
          `│ 💰 Amount: ₦${deal.amount.toLocaleString()}\n│\n` +
          `│ ${progressBar("accepted")}\n` +
          `└─────────────────────┘\n\n` +
          `👇 <b>Tap "Pay Now" to fund this deal</b>\n${LINE}`,
          { inline_keyboard: [[{ text: `💳 Pay ₦${deal.amount.toLocaleString()}`, callback_data: `pay_${dealId}` }], [{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
        );

        await notifyAdmin("Deal Accepted", `🆔 <code>${dealId}</code>\n👤 Seller: @${callbackUser} accepted\n👤 Buyer: ${deal.buyer_telegram}\n💰 ₦${deal.amount.toLocaleString()}`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // ═══════ SELLER MARKS DELIVERED ═══════
      if (callbackData.startsWith("delivered_")) {
        const dealId = callbackData.replace("delivered_", "");
        const { data: deal } = await supabase.from("deals").select("*").eq("deal_id", dealId).single();

        if (!deal || deal.status !== "funded") {
          await sendMessage(callbackChatId, `❌ This deal is not in a deliverable state.`, { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        if (!usernameMatch(`@${callbackUser}`, deal.seller_telegram)) {
          await sendMessage(callbackChatId, `❌ Only the seller can mark delivery.`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        if (deal.delivered_at) {
          await sendMessage(callbackChatId, `ℹ️ You've already marked this deal as delivered. Waiting for buyer to confirm.`, { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        await supabase.from("deals").update({ delivered_at: new Date().toISOString() }).eq("deal_id", dealId);
        await supabase.from("audit_logs").insert([{
          deal_id: dealId, action: "delivery_marked", actor: `@${callbackUser}`,
          details: { amount: deal.amount, buyer: deal.buyer_telegram },
        }]);

        const sellerAmount = deal.amount - deal.fee;

        // Notify seller
        await sendMessage(callbackChatId,
          `📦 <b>Delivery Marked!</b>\n${LINE}\n\n` +
          `🆔 <code>${dealId}</code>\n📝 ${deal.description}\n\n` +
          `⏳ Waiting for buyer to confirm receipt.\nOnce confirmed, ₦${sellerAmount.toLocaleString()} will be sent to your bank.\n${LINE}`,
          { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
        );

        // Notify buyer — they can now confirm receipt
        await notifyUser(deal.buyer_telegram,
          `📦 <b>Seller Has Delivered!</b>\n${LINE}\n\n` +
          `┌─────────────────────┐\n` +
          `│ 🆔 <code>${dealId}</code>\n` +
          `│ 📝 ${deal.description}\n` +
          `│ 👤 Seller: ${deal.seller_telegram}\n` +
          `│ 💰 ₦${deal.amount.toLocaleString()}\n│\n` +
          `│ 📦 Seller says: Item delivered!\n` +
          `└─────────────────────┘\n\n` +
          `👇 <b>Have you received your item/service?</b>\n\n⚠️ Only confirm if you've actually received it.\n${LINE}`,
          {
            inline_keyboard: [
              [{ text: "✅ Yes, I Received It", callback_data: `received_${dealId}` }],
              [{ text: "⚠️ Open Dispute", callback_data: `dispute_${dealId}` }],
            ]
          }
        );

        await notifyAdmin("Delivery Marked", `🆔 <code>${dealId}</code>\n📦 Seller @${callbackUser} marked delivered\n👤 Buyer: ${deal.buyer_telegram}\n💰 ₦${deal.amount.toLocaleString()}`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // ═══════ BUYER CONFIRMS RECEIPT → Release funds ═══════
      if (callbackData.startsWith("received_")) {
        const dealId = callbackData.replace("received_", "");
        const { data: deal } = await supabase.from("deals").select("*").eq("deal_id", dealId).single();

        if (!deal || deal.status !== "funded") {
          await sendMessage(callbackChatId, `❌ <b>Cannot Confirm</b>\n${THIN}\n\nThis deal is not in a confirmable state.`,
            { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        if (!usernameMatch(`@${callbackUser}`, deal.buyer_telegram)) {
          await sendMessage(callbackChatId, `❌ Only the buyer can confirm receipt.`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        if (!deal.delivered_at) {
          await sendMessage(callbackChatId, `⏳ The seller hasn't marked this as delivered yet. Please wait for delivery first.`,
            { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        // Double-check
        const { data: freshDeal } = await supabase.from("deals").select("status").eq("deal_id", dealId).single();
        if (freshDeal?.status !== "funded") {
          await sendMessage(callbackChatId, `❌ This deal has already been processed.`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        await supabase.from("deals").update({ status: "completed", completed_at: new Date().toISOString() }).eq("deal_id", dealId);
        await supabase.from("audit_logs").insert([{
          deal_id: dealId, action: "delivery_confirmed", actor: `@${callbackUser}`,
          details: { amount: deal.amount, fee: deal.fee },
        }]);

        const sellerAmount = deal.amount - deal.fee;

        // Try to auto-transfer to seller (case-insensitive lookup)
        const { data: sellerProfile } = await supabase.from("user_profiles").select("*").ilike("telegram_username", deal.seller_telegram).maybeSingle();
        let transferSuccess = false;

        if (sellerProfile?.paystack_recipient_code) {
          transferSuccess = await initiateTransfer(sellerAmount, sellerProfile.paystack_recipient_code, dealId, `Escrow payout for ${dealId}`);
          if (transferSuccess) {
            await supabase.from("audit_logs").insert([{
              deal_id: dealId, action: "transfer_initiated", actor: "system",
              details: { amount: sellerAmount, seller: deal.seller_telegram, method: "auto" },
            }]);
          }
        }

        // Notify buyer
        await sendMessage(callbackChatId,
          `🎉 <b>Deal Completed!</b>\n${LINE}\n\n` +
          `┌─────────────────────┐\n` +
          `│ 🆔 <code>${dealId}</code>\n│\n` +
          `│ 📤 ₦${sellerAmount.toLocaleString()} → ${deal.seller_telegram}\n` +
          `│ 💵 Fee: ₦${deal.fee.toLocaleString()}\n│\n` +
          `│ ${progressBar("completed")}\n` +
          `└─────────────────────┘\n\n` +
          (transferSuccess ? `✅ Funds transferred to seller's bank account.\n` : `💰 Funds will be sent to seller by admin.\n`) +
          `Thank you for using TrustPay9ja! 🛡️\n${LINE}`,
          { inline_keyboard: [[{ text: "➕ New Deal", callback_data: "open_newdeal" }, { text: "📋 My Deals", callback_data: "open_mydeals" }]] }
        );

        // Notify seller
        await notifyUser(deal.seller_telegram,
          `🎉 <b>Deal Completed — You Got Paid!</b>\n${LINE}\n\n` +
          `┌─────────────────────┐\n` +
          `│ 🆔 <code>${dealId}</code>\n` +
          `│ 📝 ${deal.description}\n` +
          `│ 👤 Buyer: ${deal.buyer_telegram}\n│\n` +
          `│ 💰 Deal Amount: ₦${deal.amount.toLocaleString()}\n` +
          `│ 💵 Fee: ₦${deal.fee.toLocaleString()}\n` +
          `│ 📤 <b>You receive: ₦${sellerAmount.toLocaleString()}</b>\n│\n` +
          `│ ${progressBar("completed")}\n` +
          `└─────────────────────┘\n\n` +
          (transferSuccess
            ? `✅ ₦${sellerAmount.toLocaleString()} has been sent to your bank account!\n`
            : (!sellerProfile?.bank_name
              ? `⚠️ You haven't registered a bank account.\nUse /setbank to add your bank details for future payouts.\nAdmin will process this payout manually.\n`
              : `💰 Transfer is being processed by admin.\n`
            )) +
          `${LINE}`,
          { inline_keyboard: [[{ text: "🏦 Register Bank", callback_data: "open_register" }, { text: "📋 My Deals", callback_data: "open_mydeals" }]] }
        );

        const sellerAmt = deal.amount - deal.fee;
        await notifyAdmin("Deal Completed ✅", `🆔 <code>${dealId}</code>\n👤 Buyer: ${deal.buyer_telegram} confirmed receipt\n👤 Seller: ${deal.seller_telegram}\n💰 ₦${deal.amount.toLocaleString()} · Fee: ₦${deal.fee.toLocaleString()}\n📤 Transfer: ${transferSuccess ? "✅ Sent" : "⏳ Manual"}`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // --- Buyer opens dispute ---
      if (callbackData.startsWith("dispute_")) {
        const dealId = callbackData.replace("dispute_", "");
        const { data: deal } = await supabase.from("deals").select("*").eq("deal_id", dealId).single();

        if (!deal || deal.status !== "funded") {
          await sendMessage(callbackChatId, `❌ <b>Cannot Dispute</b>\n${THIN}\n\nThis deal cannot be disputed right now.`,
            { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        if (!usernameMatch(`@${callbackUser}`, deal.buyer_telegram)) {
          await sendMessage(callbackChatId, `❌ Only the buyer can open a dispute.`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        await supabase.from("deals").update({ status: "disputed", dispute_reason: "Buyer opened dispute via Telegram" }).eq("deal_id", dealId);
        await supabase.from("audit_logs").insert([{
          deal_id: dealId, action: "dispute_opened", actor: `@${callbackUser}`,
          details: { amount: deal.amount, seller: deal.seller_telegram },
        }]);

        await sendMessage(callbackChatId,
          `⚠️ <b>Dispute Opened</b>\n${LINE}\n\n` +
          `┌─────────────────────┐\n` +
          `│ 🆔 <code>${dealId}</code>\n` +
          `│ 💰 ₦${deal.amount.toLocaleString()}\n` +
          `│ 👤 Seller: ${deal.seller_telegram}\n│\n` +
          `│ ${progressBar("disputed")}\n` +
          `└─────────────────────┘\n\n` +
          `🔍 An admin will review this shortly.\nFunds are safely held until resolved.\n${LINE}`,
          { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }], [{ text: "🔙 Menu", callback_data: "open_start" }]] }
        );

        await notifyUser(deal.seller_telegram,
          `⚠️ <b>Dispute Opened on Your Deal</b>\n${LINE}\n\n` +
          `┌─────────────────────┐\n` +
          `│ 🆔 <code>${dealId}</code>\n` +
          `│ 📝 ${deal.description}\n` +
          `│ 👤 Buyer: ${deal.buyer_telegram}\n` +
          `│ 💰 ₦${deal.amount.toLocaleString()}\n│\n` +
          `│ ${progressBar("disputed")}\n` +
          `└─────────────────────┘\n\n` +
          `The buyer has raised a concern. An admin will review and resolve.\nFunds remain held securely.\n${LINE}`,
          { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
        );

        await notifyAdmin("⚠️ Dispute Opened", `🆔 <code>${dealId}</code>\n👤 Buyer: @${callbackUser} opened dispute\n👤 Seller: ${deal.seller_telegram}\n💰 ₦${deal.amount.toLocaleString()}\n\n⚡ Requires your attention!`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // --- Pay button (only for ACCEPTED deals) ---
      if (callbackData.startsWith("pay_")) {
        const dealId = callbackData.replace("pay_", "");
        const { data: deal } = await supabase.from("deals").select("*").eq("deal_id", dealId).single();

        if (!deal) {
          await sendMessage(callbackChatId, `❌ Deal not found.`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        if (deal.status === "pending") {
          await sendMessage(callbackChatId, `⏳ <b>Waiting for Seller</b>\n${THIN}\n\nThe seller hasn't accepted this deal yet. You'll be notified once they accept.`,
            { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        if (deal.status !== "accepted") {
          await sendMessage(callbackChatId, `ℹ️ Deal ${dealId} is ${statusEmoji(deal.status)} <b>${statusLabel(deal.status)}</b>`,
            { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
        if (!PAYSTACK_SECRET_KEY) {
          await sendMessage(callbackChatId, `⚠️ Payment system not configured. Contact admin.`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: deal.amount * 100,
            email: `${callbackUser}@escrowbot.ng`,
            reference: `${dealId}-${Date.now()}`,
            metadata: { deal_id: dealId, buyer: deal.buyer_telegram, seller: deal.seller_telegram, buyer_chat_id: callbackChatId },
            callback_url: "https://t.me/TrustPay9jaBot",
          }),
        });

        const paystackData = await paystackRes.json();

        if (paystackData.status && paystackData.data?.authorization_url) {
          const payLink = paystackData.data.authorization_url;
          await supabase.from("deals").update({ paystack_payment_link: payLink, payment_ref: paystackData.data.reference }).eq("deal_id", dealId);

          await sendMessage(callbackChatId,
            `💳 <b>Payment Ready</b>\n${LINE}\n\n` +
            `┌─────────────────────┐\n` +
            `│ 🆔 <code>${dealId}</code>\n` +
            `│ 💰 Amount: ₦${deal.amount.toLocaleString()}\n` +
            `│ 📝 ${deal.description}\n` +
            `│ 👤 To: ${deal.seller_telegram}\n` +
            `└─────────────────────┘\n\n` +
            `👇 <b>Tap below to pay securely via Paystack</b>\n\n🔒 Funds held in escrow until you confirm receipt.\n${LINE}`,
            { inline_keyboard: [[{ text: `💳 Pay ₦${deal.amount.toLocaleString()}`, url: payLink }], [{ text: "🔙 My Deals", callback_data: "open_mydeals" }]] }
          );
        } else {
          console.error("Paystack error:", paystackData);
          await sendMessage(callbackChatId, `❌ <b>Payment Error</b>\n${THIN}\n\nFailed to generate payment link. Try again.`,
            { inline_keyboard: [[{ text: "🔄 Retry", callback_data: `pay_${dealId}` }]] });
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // --- Cancel PENDING deal ---
      if (callbackData.startsWith("cancel_pending_")) {
        const dealId = callbackData.replace("cancel_pending_", "");
        const { data: deal } = await supabase.from("deals").select("*").eq("deal_id", dealId).single();

        if (!deal || deal.status !== "pending") {
          await sendMessage(callbackChatId, `❌ This deal cannot be cancelled.`, { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        if (!usernameMatch(`@${callbackUser}`, deal.buyer_telegram)) {
          await sendMessage(callbackChatId, `❌ Only the buyer can cancel this deal.`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        await supabase.from("deals").update({ status: "completed", completed_at: new Date().toISOString(), dispute_resolution: "cancelled_by_buyer" }).eq("deal_id", dealId);
        await supabase.from("audit_logs").insert([{ deal_id: dealId, action: "deal_cancelled", actor: `@${callbackUser}`, details: { reason: "Buyer cancelled before payment", amount: deal.amount } }]);

        await sendMessage(callbackChatId,
          `✅ <b>Deal Cancelled</b>\n${LINE}\n\n🆔 <code>${dealId}</code>\n📝 ${deal.description}\n💰 ₦${deal.amount.toLocaleString()}\n\nNo payment was made — deal removed.\n${LINE}`,
          { inline_keyboard: [[{ text: "➕ New Deal", callback_data: "open_newdeal" }, { text: "📋 My Deals", callback_data: "open_mydeals" }]] }
        );

        await notifyUser(deal.seller_telegram,
          `❌ <b>Deal Cancelled</b>\n${LINE}\n\n🆔 <code>${dealId}</code>\n📝 ${deal.description}\n👤 Buyer: ${deal.buyer_telegram}\n\nThe buyer cancelled this deal.\n${LINE}`,
          { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
        );

        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // --- Cancel FUNDED deal (within 1 hour) ---
      if (callbackData.startsWith("cancel_funded_")) {
        const dealId = callbackData.replace("cancel_funded_", "");
        const { data: deal } = await supabase.from("deals").select("*").eq("deal_id", dealId).single();

        if (!deal || deal.status !== "funded") {
          await sendMessage(callbackChatId, `❌ This deal cannot be cancelled.`, { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        if (!usernameMatch(`@${callbackUser}`, deal.buyer_telegram)) {
          await sendMessage(callbackChatId, `❌ Only the buyer can cancel this deal.`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const fundedAt = new Date(deal.funded_at).getTime();
        const hoursSinceFunded = (Date.now() - fundedAt) / 3600000;
        if (hoursSinceFunded > 1) {
          await sendMessage(callbackChatId,
            `⏰ <b>Cancellation Window Expired</b>\n${LINE}\n\nFree cancellation is only available within 1 hour of payment.\n\nTo get a refund now, please open a dispute and an admin will review it.\n${LINE}`,
            { inline_keyboard: [[{ text: "⚠️ Open Dispute", callback_data: `dispute_${dealId}` }, { text: "📋 My Deals", callback_data: "open_mydeals" }]] }
          );
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
        let refundSuccess = false;
        if (PAYSTACK_SECRET_KEY && deal.payment_ref) {
          const res = await fetch("https://api.paystack.co/refund", {
            method: "POST",
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ transaction: deal.payment_ref }),
          });
          const data = await res.json();
          refundSuccess = data.status === true;
          if (!refundSuccess) console.error("Refund failed:", data);
        }

        await supabase.from("deals").update({ status: "refunded", completed_at: new Date().toISOString(), dispute_resolution: refundSuccess ? "refunded_auto" : "refund_pending_admin", refund_status: refundSuccess ? "processing" : "initiated" }).eq("deal_id", dealId);
        await supabase.from("audit_logs").insert([{ deal_id: dealId, action: "deal_cancelled_refund", actor: `@${callbackUser}`, details: { reason: "Buyer cancelled within 1 hour", amount: deal.amount, refund_success: refundSuccess } }]);

        await sendMessage(callbackChatId,
          `✅ <b>Deal Cancelled</b>\n${LINE}\n\n🆔 <code>${dealId}</code>\n📝 ${deal.description}\n💰 ₦${deal.amount.toLocaleString()}\n\n` +
          (refundSuccess ? `💸 Your refund has been initiated! It may take 1-3 business days to reflect.\n` : `⏳ Refund is being processed by admin. You'll be notified when complete.\n`) +
          `${LINE}`,
          { inline_keyboard: [[{ text: "➕ New Deal", callback_data: "open_newdeal" }, { text: "📋 My Deals", callback_data: "open_mydeals" }]] }
        );

        await notifyUser(deal.seller_telegram,
          `❌ <b>Deal Cancelled by Buyer</b>\n${LINE}\n\n🆔 <code>${dealId}</code>\n📝 ${deal.description}\n👤 Buyer: ${deal.buyer_telegram}\n💰 ₦${deal.amount.toLocaleString()}\n\nThe buyer cancelled within the 1-hour window. Funds are being refunded.\n${LINE}`,
          { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
        );

        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // --- Seller DECLINES a pending deal ---
      if (callbackData.startsWith("decline_pending_")) {
        const dealId = callbackData.replace("decline_pending_", "");
        const { data: deal } = await supabase.from("deals").select("*").eq("deal_id", dealId).single();

        if (!deal || deal.status !== "pending") {
          await sendMessage(callbackChatId, `❌ This deal cannot be declined.`, { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        if (!usernameMatch(`@${callbackUser}`, deal.seller_telegram)) {
          await sendMessage(callbackChatId, `❌ Only the seller can decline this deal.`);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        await supabase.from("deals").update({ status: "completed", completed_at: new Date().toISOString(), dispute_resolution: "declined_by_seller" }).eq("deal_id", dealId);
        await supabase.from("audit_logs").insert([{ deal_id: dealId, action: "deal_declined", actor: `@${callbackUser}`, details: { reason: "Seller declined before payment", amount: deal.amount } }]);

        await sendMessage(callbackChatId,
          `✅ <b>Deal Declined</b>\n${LINE}\n\n🆔 <code>${dealId}</code>\n📝 ${deal.description}\n👤 Buyer: ${deal.buyer_telegram}\n💰 ₦${deal.amount.toLocaleString()}\n\nYou've declined this deal. No payment was involved.\n${LINE}`,
          { inline_keyboard: [[{ text: "📋 My Deals", callback_data: "open_mydeals" }]] }
        );

        await notifyUser(deal.buyer_telegram,
          `❌ <b>Deal Declined by Seller</b>\n${LINE}\n\n🆔 <code>${dealId}</code>\n📝 ${deal.description}\n👤 Seller: ${deal.seller_telegram}\n💰 ₦${deal.amount.toLocaleString()}\n\nThe seller has declined this deal. No payment was made.\nYou can create a new deal with another seller.\n${LINE}`,
          { inline_keyboard: [[{ text: "➕ New Deal", callback_data: "open_newdeal" }, { text: "📋 My Deals", callback_data: "open_mydeals" }]] }
        );

        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // --- Clear Chat ---
      if (callbackData === "clear_chat") {
        await sendMessage(callbackChatId,
          `🧹 <b>Clear Chat</b>\n${LINE}\n\n⚠️ This will delete all bot messages.\nYour deals & history are <b>safe</b>.\n\nAre you sure?`,
          { inline_keyboard: [[{ text: "✅ Yes, Clear", callback_data: "clear_chat_confirm" }, { text: "❌ Cancel", callback_data: "open_start" }]] }
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      if (callbackData === "clear_chat_confirm") {
        const currentMsgId = body.callback_query.message.message_id;
        let deletedCount = 0;
        const deletePromises = [];
        for (let i = currentMsgId; i > Math.max(0, currentMsgId - 100); i--) {
          deletePromises.push(
            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: callbackChatId, message_id: i }),
            }).then(r => r.json()).then(r => { if (r.ok) deletedCount++; }).catch(() => { })
          );
        }
        await Promise.all(deletePromises);

        await supabase.from("audit_logs").insert([{
          action: "chat_cleared", actor: `@${callbackUser}`,
          details: { deleted_count: deletedCount, chat_id: callbackChatId },
        }]);

        await sendMessage(callbackChatId,
          `✅ Chat cleared! (${deletedCount} messages removed)\n\nYour deals and history are safe. 🛡️`,
          mainMenuKeyboard
        );
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // ═══════ MARKETPLACE: Buy with Escrow from listing preview ═══════
      if (callbackData.startsWith("mkt_escrow_")) {
        const listingId = callbackData.replace("mkt_escrow_", "");
        try {
          const { data: listing } = await marketSupabase.from("listings").select("*").eq("id", listingId).maybeSingle();
          if (!listing) {
            await sendMessage(callbackChatId, `❌ Listing no longer available.`, mainMenuKeyboard);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }
          if (listing.seller_telegram_id === body.callback_query.from.id) {
            await sendMessage(callbackChatId, `❌ You cannot buy your own listing.`, mainMenuKeyboard);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          // Create or find pending transaction
          let { data: existingTx } = await marketSupabase.from("transactions").select("*")
            .eq("listing_id", listingId).eq("buyer_telegram_id", body.callback_query.from.id).eq("status", "pending")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (!existingTx) {
            const { data: newTx } = await marketSupabase.from("transactions").insert({
              listing_id: listingId,
              buyer_telegram_id: body.callback_query.from.id,
              seller_telegram_id: listing.seller_telegram_id,
              amount: listing.price,
              status: "pending",
            }).select().single();
            existingTx = newTx;
          }

          const { data: sellerUser } = await marketSupabase.from("bot_users").select("first_name, username")
            .eq("telegram_id", listing.seller_telegram_id).maybeSingle();

          const sellerName = sellerUser?.username ? `@${sellerUser.username}` : (sellerUser?.first_name || `User ${listing.seller_telegram_id}`);

          await sendMessage(callbackChatId,
            `🛒 <b>Escrow Payment</b>\n${LINE}\n\n` +
            `📝 <b>${listing.title}</b>\n💰 ₦${Number(listing.price).toLocaleString()}\n👤 Seller: ${sellerName}\n\n` +
            `🔒 Funds held in escrow until you confirm delivery.\n${LINE}`,
            {
              inline_keyboard: [
                [{ text: `✅ Confirm Payment ₦${Number(listing.price).toLocaleString()}`, callback_data: `mkt_pay_${existingTx!.id}` }],
                [{ text: "❌ Cancel", callback_data: "open_start" }],
              ]
            }
          );
        } catch (e) {
          console.error("Marketplace escrow error:", e);
          await sendMessage(callbackChatId, `❌ Something went wrong.`, mainMenuKeyboard);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // ═══════ MARKETPLACE: Confirm payment → status = "paid" ═══════
      if (callbackData.startsWith("mkt_pay_")) {
        const txId = callbackData.replace("mkt_pay_", "");
        try {
          const { data: tx } = await marketSupabase.from("transactions").select("*").eq("id", txId).maybeSingle();
          if (!tx || tx.status !== "pending") {
            await sendMessage(callbackChatId, `❌ Transaction not found or already processed.`, mainMenuKeyboard);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }
          if (tx.buyer_telegram_id !== body.callback_query.from.id) {
            await sendMessage(callbackChatId, `❌ Only the buyer can confirm payment.`);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
          if (!PAYSTACK_SECRET_KEY) {
            await sendMessage(callbackChatId, `⚠️ Payment system not configured. Contact admin.`);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          let listingTitle = "Item";
          if (tx.listing_id) {
            const { data: listing } = await marketSupabase.from("listings").select("title").eq("id", tx.listing_id).maybeSingle();
            if (listing) listingTitle = listing.title;
          }

          const amount = Number(tx.amount);
          const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
            method: "POST",
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: amount * 100,
              email: `${callbackUser}@market.trustpay.ng`,
              reference: `MKT-${txId}-${Date.now()}`,
              metadata: {
                type: "market_transaction",
                tx_id: txId,
                buyer_telegram_id: tx.buyer_telegram_id,
                seller_telegram_id: tx.seller_telegram_id,
                buyer_chat_id: callbackChatId,
                listing_title: listingTitle
              },
              callback_url: "https://t.me/TrustPay9jaBot",
            }),
          });

          const paystackData = await paystackRes.json();

          if (paystackData.status && paystackData.data?.authorization_url) {
            const payLink = paystackData.data.authorization_url;
            // Update transaction in market DB with payment link/ref
            await marketSupabase.from("transactions").update({
              payment_link: payLink,
              payment_ref: paystackData.data.reference
            }).eq("id", txId);

            await sendMessage(callbackChatId,
              `💳 <b>Payment Ready</b>\n${LINE}\n\n` +
              `┌─────────────────────┐\n` +
              `│ 📝 ${listingTitle}\n` +
              `│ 💰 Amount: ₦${amount.toLocaleString()}\n` +
              `│ 👤 Seller: tg:${tx.seller_telegram_id}\n` +
              `└─────────────────────┘\n\n` +
              `👇 <b>Tap below to pay securely via Paystack</b>\n\n🔒 Funds held in escrow until you confirm receipt.\n${LINE}`,
              { inline_keyboard: [[{ text: `💳 Pay ₦${amount.toLocaleString()}`, url: payLink }], [{ text: "🔙 Menu", callback_data: "open_start" }]] }
            );

            await supabase.from("audit_logs").insert([{
              action: "marketplace_payment_init", actor: `tg:${tx.buyer_telegram_id}`,
              details: { tx_id: txId, amount: tx.amount, listing: listingTitle },
            }]);
          } else {
            console.error("Paystack error:", paystackData);
            await sendMessage(callbackChatId, `❌ <b>Payment Error</b>\n${THIN}\n\nFailed to generate payment link. Try again.`,
              { inline_keyboard: [[{ text: "🔄 Retry", callback_data: `mkt_pay_${txId}` }]] });
          }

        } catch (e) {
          console.error("Marketplace payment error:", e);
          await sendMessage(callbackChatId, `❌ Payment failed. Try again.`, mainMenuKeyboard);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // ═══════ MARKETPLACE: Seller marks delivered ═══════
      if (callbackData.startsWith("mkt_delivered_")) {
        const txId = callbackData.replace("mkt_delivered_", "");
        try {
          const { data: tx } = await marketSupabase.from("transactions").select("*").eq("id", txId).maybeSingle();
          if (!tx || tx.status !== "paid") {
            await sendMessage(callbackChatId, `❌ Transaction not in deliverable state.`, mainMenuKeyboard);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }
          if (tx.seller_telegram_id !== body.callback_query.from.id) {
            await sendMessage(callbackChatId, `❌ Only the seller can mark as delivered.`);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          let listingTitle = "Item";
          if (tx.listing_id) {
            const { data: listing } = await marketSupabase.from("listings").select("title").eq("id", tx.listing_id).maybeSingle();
            if (listing) listingTitle = listing.title;
          }

          await sendMessage(callbackChatId,
            `📦 <b>Delivery Marked!</b>\n${LINE}\n\n📝 ${listingTitle}\n⏳ Waiting for buyer to confirm receipt.\n${LINE}`,
            { inline_keyboard: [[{ text: "🔙 Menu", callback_data: "open_start" }]] }
          );

          // Ask buyer to confirm
          const { data: sellerUser } = await marketSupabase.from("bot_users").select("username, first_name")
            .eq("telegram_id", tx.seller_telegram_id).maybeSingle();

          const sellerName = sellerUser?.username ? `@${sellerUser.username}` : (sellerUser?.first_name || "Seller");

          await sendMessage(tx.buyer_telegram_id,
            `📦 <b>Seller Has Delivered!</b>\n${LINE}\n\n` +
            `📝 ${listingTitle}\n👤 Seller: ${sellerName}\n💰 ₦${Number(tx.amount).toLocaleString()}\n\n` +
            `👇 <b>Have you received your item?</b>\n⚠️ Only confirm if you've actually received it.\n${LINE}`,
            {
              inline_keyboard: [
                [{ text: "✅ Confirm Receipt", callback_data: `mkt_received_${txId}` }],
                [{ text: "⚠️ Raise Dispute", callback_data: `mkt_dispute_${txId}` }],
              ]
            }
          );

          await marketSupabase.from("notifications").insert({
            recipient_telegram_id: tx.buyer_telegram_id,
            sender_telegram_id: tx.seller_telegram_id,
            title: "Item Delivered",
            message: `${sellerName} has marked ${listingTitle} as delivered. Please confirm receipt.`,
            type: "delivery_marked",
            listing_id: tx.listing_id,
          });


        } catch (e) {
          console.error("Marketplace delivered error:", e);
          await sendMessage(callbackChatId, `❌ Something went wrong.`, mainMenuKeyboard);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // ═══════ MARKETPLACE: Buyer confirms receipt → released ═══════
      if (callbackData.startsWith("mkt_received_")) {
        const txId = callbackData.replace("mkt_received_", "");
        try {
          const { data: tx } = await marketSupabase.from("transactions").select("*").eq("id", txId).maybeSingle();
          if (!tx || tx.status !== "paid") {
            await sendMessage(callbackChatId, `❌ Transaction cannot be confirmed.`, mainMenuKeyboard);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }
          if (tx.buyer_telegram_id !== body.callback_query.from.id) {
            await sendMessage(callbackChatId, `❌ Only the buyer can confirm receipt.`);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          await marketSupabase.from("transactions").update({ status: "released" }).eq("id", txId);

          let listingTitle = "Item";
          if (tx.listing_id) {
            const { data: listing } = await marketSupabase.from("listings").select("title").eq("id", tx.listing_id).maybeSingle();
            if (listing) listingTitle = listing.title;
          }

          const amount = Number(tx.amount);
          const fee = Math.max(300, Math.round(amount * 0.05));
          const sellerAmount = amount - fee;

          // Attempt auto-payout to seller
          const { data: sellerUser } = await marketSupabase.from("bot_users").select("username").eq("telegram_id", tx.seller_telegram_id).maybeSingle();
          let transferSuccess = false;
          let sellerProfile = null;

          if (sellerUser?.username) {
            const { data: profile } = await supabase.from("user_profiles").select("*").ilike("telegram_username", `@${sellerUser.username}`).maybeSingle();
            sellerProfile = profile;

            if (sellerProfile?.paystack_recipient_code) {
              transferSuccess = await initiateTransfer(sellerAmount, sellerProfile.paystack_recipient_code, `MKT-${txId}`, `Marketplace payout for ${listingTitle}`);
              if (transferSuccess) {
                await supabase.from("audit_logs").insert([{
                  deal_id: `MKT-${txId}`, action: "transfer_initiated", actor: "system",
                  details: { amount: sellerAmount, seller: sellerUser.username, method: "auto", source: "marketplace" },
                }]);
              }
            }
          }

          await sendMessage(callbackChatId,
            `🎉 <b>Transaction Complete!</b>\n${LINE}\n\n📝 ${listingTitle}\n💰 ₦${amount.toLocaleString()}\n\n` +
            `Payment has been released to the seller. Thank you! 🛡️\n${LINE}`,
            mainMenuKeyboard
          );

          // Notify seller
          const { data: buyerUser } = await marketSupabase.from("bot_users").select("username, first_name")
            .eq("telegram_id", tx.buyer_telegram_id).maybeSingle();

          const buyerName = buyerUser?.username ? `@${buyerUser.username}` : (buyerUser?.first_name || "Buyer");

          await sendMessage(tx.seller_telegram_id,
            `🎉 <b>Payment Released!</b>\n${LINE}\n\n📝 ${listingTitle}\n💰 ₦${amount.toLocaleString()}\n👤 Buyer: ${buyerName}\n\n` +
            (transferSuccess
              ? `✅ ₦${sellerAmount.toLocaleString()} has been sent to your bank account!\n`
              : `💰 Funds (₦${sellerAmount.toLocaleString()}) are being processed by admin. Use /setbank to automate future payouts.\n`) +
            `The buyer confirmed receipt. Funds have been released! 🎊\n${LINE}`,
            mainMenuKeyboard
          );

          await marketSupabase.from("notifications").insert([
            {
              recipient_telegram_id: tx.seller_telegram_id,
              sender_telegram_id: tx.buyer_telegram_id,
              title: "Payment Released",
              message: `${buyerName} confirmed receipt of ${listingTitle}. ₦${sellerAmount.toLocaleString()} released.`,
              type: "payment_released",
              listing_id: tx.listing_id,
            },
            {
              recipient_telegram_id: tx.buyer_telegram_id,
              title: "Transaction Complete",
              message: `Your purchase of ${listingTitle} is complete.`,
              type: "transaction_complete",
              listing_id: tx.listing_id,
            },
          ]);

          await supabase.from("audit_logs").insert([{
            action: "marketplace_released", actor: `tg:${tx.buyer_telegram_id}`,
            details: { tx_id: txId, amount, listing: listingTitle, payout: transferSuccess ? "auto" : "manual" },
          }]);

        } catch (e) {
          console.error("Marketplace received error:", e);
          await sendMessage(callbackChatId, `❌ Something went wrong.`, mainMenuKeyboard);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // ═══════ MARKETPLACE: Buyer raises dispute ═══════
      if (callbackData.startsWith("mkt_dispute_")) {
        const txId = callbackData.replace("mkt_dispute_", "");
        try {
          const { data: tx } = await marketSupabase.from("transactions").select("*").eq("id", txId).maybeSingle();
          if (!tx || tx.status !== "paid") {
            await sendMessage(callbackChatId, `❌ Transaction cannot be disputed.`, mainMenuKeyboard);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }
          if (tx.buyer_telegram_id !== body.callback_query.from.id) {
            await sendMessage(callbackChatId, `❌ Only the buyer can raise a dispute.`);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }

          await marketSupabase.from("transactions").update({ status: "disputed" }).eq("id", txId);

          let listingTitle = "Item";
          if (tx.listing_id) {
            const { data: listing } = await marketSupabase.from("listings").select("title").eq("id", tx.listing_id).maybeSingle();
            if (listing) listingTitle = listing.title;
          }

          await sendMessage(callbackChatId,
            `⚠️ <b>Dispute Opened</b>\n${LINE}\n\n📝 ${listingTitle}\n💰 ₦${Number(tx.amount).toLocaleString()}\n\n` +
            `An admin will review this shortly. Funds are safely held.\n${LINE}`,
            { inline_keyboard: [[{ text: "🔙 Menu", callback_data: "open_start" }]] }
          );

          await sendMessage(tx.seller_telegram_id,
            `⚠️ <b>Dispute Opened on Your Sale</b>\n${LINE}\n\n📝 ${listingTitle}\n💰 ₦${Number(tx.amount).toLocaleString()}\n\n` +
            `The buyer has raised a concern. An admin will review.\n${LINE}`,
            { inline_keyboard: [[{ text: "🔙 Menu", callback_data: "open_start" }]] }
          );

          await marketSupabase.from("notifications").insert([
            {
              recipient_telegram_id: tx.seller_telegram_id,
              sender_telegram_id: tx.buyer_telegram_id,
              title: "Dispute Opened",
              message: `A dispute has been raised on ${listingTitle}.`,
              type: "dispute_opened",
              listing_id: tx.listing_id,
            },
          ]);


          await notifyAdmin("⚠️ Marketplace Dispute",
            `📝 ${listingTitle}\n💰 ₦${Number(tx.amount).toLocaleString()}\n👤 Buyer: tg:${tx.buyer_telegram_id}\n👤 Seller: tg:${tx.seller_telegram_id}`
          );

          await supabase.from("audit_logs").insert([{
            action: "marketplace_dispute", actor: `tg:${tx.buyer_telegram_id}`,
            details: { tx_id: txId, amount: tx.amount, listing: listingTitle },
          }]);

        } catch (e) {
          console.error("Marketplace dispute error:", e);
          await sendMessage(callbackChatId, `❌ Something went wrong.`, mainMenuKeyboard);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
    }

    // Fallback
    await sendMessage(chatId,
      `🛡️ <b>TrustPay9ja</b>\n${LINE}\n\n` +
      `I didn't understand that. Try:\n\n` +
      `• <code>@seller 5000 item</code> — Create a deal\n` +
      `• /mydeals — View your deals\n` +
      `• /help — How it works\n${LINE}`,
      mainMenuKeyboard
    );

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (error) {
    console.error("Bot error:", error);
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  }
});

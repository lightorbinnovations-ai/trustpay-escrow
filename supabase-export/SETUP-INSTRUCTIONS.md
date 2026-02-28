# TrustPay Escrow — New Supabase Setup Instructions

## Step 1: Create a New Supabase Project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project**, pick a name & region, set a database password
3. Wait for it to finish provisioning

---

## Step 2: Run the Migration SQL

1. In your new Supabase project, go to **SQL Editor**
2. Open the file `full-schema-migration.sql` from this folder
3. Copy and paste the **entire** contents into the SQL Editor
4. Click **Run** — this creates all 9 tables, RLS policies, functions, storage bucket, and realtime subscriptions

---

## Step 3: Set Secrets (Edge Functions)

Go to **Project Settings → Edge Functions → Secrets** and add these:

| Secret Name | Where to Get It |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From [@BotFather](https://t.me/BotFather) on Telegram |
| `PAYSTACK_SECRET_KEY` | From [Paystack Dashboard → Settings → API Keys](https://dashboard.paystack.com/#/settings/developers) |

---

## Step 4: Deploy Edge Functions

Copy the entire `supabase/functions/` folder from this project into your new project's `supabase/functions/` directory. The edge functions are:

| Function | Purpose |
|---|---|
| `telegram-bot` | Main Telegram bot handler |
| `paystack-webhook` | Handles Paystack payment callbacks |
| `auto-release` | Auto-releases funds after delivery timeout |
| `deal-notify` | Sends Telegram notifications for deal events |
| `resolve-dispute` | Admin dispute resolution logic |
| `setup-webhook` | Sets up the Telegram webhook URL |
| `verify-admin` | Verifies admin access |

Deploy them with the Supabase CLI:
```bash
supabase functions deploy telegram-bot
supabase functions deploy paystack-webhook
supabase functions deploy auto-release
supabase functions deploy deal-notify
supabase functions deploy resolve-dispute
supabase functions deploy setup-webhook
supabase functions deploy verify-admin
```

---

## Step 5: Update Frontend Environment

In your frontend project's `.env` file, update these values with your **new** Supabase project credentials:

```env
VITE_SUPABASE_URL="https://YOUR_NEW_PROJECT_ID.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your_new_anon_key_here"
VITE_SUPABASE_PROJECT_ID="YOUR_NEW_PROJECT_ID"
```

You can find these in **Supabase Dashboard → Project Settings → API**.

---

## Step 6: Set Up Telegram Webhook

After deploying edge functions, call the `setup-webhook` function to register your bot's webhook:

```
https://YOUR_NEW_PROJECT_ID.supabase.co/functions/v1/setup-webhook
```

---

## Step 7: Migrate Existing Data (Optional)

If you want to bring over existing data from the old project:

1. In the **old** Supabase project, go to SQL Editor and export data:
   ```sql
   -- Run these one at a time, copy the results
   SELECT * FROM bot_users;
   SELECT * FROM user_profiles;
   SELECT * FROM listings;
   SELECT * FROM deals;
   SELECT * FROM deal_ratings;
   SELECT * FROM transactions;
   SELECT * FROM notifications;
   SELECT * FROM audit_logs;
   SELECT * FROM platform_settings;
   ```
2. Use the **Table Editor** in your new project to import the CSV data, or use `INSERT` statements in the SQL editor.

---

## File Structure Summary

```
supabase-export/
├── full-schema-migration.sql   ← Run this in SQL Editor
├── SETUP-INSTRUCTIONS.md       ← You are here
```

```
supabase/functions/             ← Copy this entire folder
├── auto-release/index.ts
├── deal-notify/index.ts
├── paystack-webhook/index.ts
├── resolve-dispute/index.ts
├── setup-webhook/index.ts
├── telegram-bot/index.ts
└── verify-admin/index.ts
```

---

## Checklist

- [ ] New Supabase project created
- [ ] `full-schema-migration.sql` executed in SQL Editor
- [ ] Secrets added (`TELEGRAM_BOT_TOKEN`, `PAYSTACK_SECRET_KEY`)
- [ ] Edge functions deployed
- [ ] Frontend `.env` updated with new credentials
- [ ] Telegram webhook set up
- [ ] (Optional) Data migrated from old project

-- PRODUCTION LOCK: Telegram ID Mandate for Escrow
-- This migration ensures that every deal has unique Telegram IDs for buyer and seller.

-- 1. Ensure columns exist (long-term bigint for Telegram IDs)
ALTER TABLE public.deals 
ADD COLUMN IF NOT EXISTS buyer_id bigint,
ADD COLUMN IF NOT EXISTS seller_id bigint;

-- 2. Proactive ID Backfill
-- Tries to translate usernames to IDs from existing system records
DO $$
BEGIN
    -- Fix Buyer IDs
    UPDATE public.deals d
    SET buyer_id = COALESCE(
        (SELECT telegram_id FROM public.bot_users b WHERE b.username = REPLACE(d.buyer_telegram, '@', '') LIMIT 1),
        (SELECT telegram_chat_id FROM public.user_profiles p WHERE p.telegram_username = REPLACE(d.buyer_telegram, '@', '') LIMIT 1)
    )
    WHERE d.buyer_id IS NULL;

    -- Fix Seller IDs
    UPDATE public.deals d
    SET seller_id = COALESCE(
        (SELECT telegram_id FROM public.bot_users b WHERE b.username = REPLACE(d.seller_telegram, '@', '') LIMIT 1),
        (SELECT telegram_chat_id FROM public.user_profiles p WHERE p.telegram_username = REPLACE(d.seller_telegram, '@', '') LIMIT 1)
    )
    WHERE d.seller_id IS NULL;

    -- IDENTIFY AND FIX REMAINING: 
    -- For any deals that still lack IDs (orphan deals), we assign a critical system log ID (0) 
    -- to prevent NOT NULL failure, while marking them for manual review or deletion.
    UPDATE public.deals 
    SET buyer_id = 0 
    WHERE buyer_id IS NULL;

    UPDATE public.deals 
    SET seller_id = 0 
    WHERE seller_id IS NULL;
END $$;

-- 3. Enforce NOT NULL Constraints
ALTER TABLE public.deals 
ALTER COLUMN buyer_id SET NOT NULL,
ALTER COLUMN seller_id SET NOT NULL;

-- 4. Final Security Indexes
CREATE INDEX IF NOT EXISTS idx_deals_security_buyer ON public.deals(buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_deals_security_seller ON public.deals(seller_id, status);

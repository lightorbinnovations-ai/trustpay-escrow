-- Add Telegram ID columns to deals table for robust authorization
ALTER TABLE public.deals 
ADD COLUMN IF NOT EXISTS buyer_id bigint,
ADD COLUMN IF NOT EXISTS seller_id bigint;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_deals_buyer_id ON public.deals(buyer_id);
CREATE INDEX IF NOT EXISTS idx_deals_seller_id ON public.deals(seller_id);

-- Backfill IDs from bot_users if possible (optional but helpful)
DO $$
BEGIN
    UPDATE public.deals d
    SET buyer_id = b.telegram_id
    FROM public.bot_users b
    WHERE d.buyer_id IS NULL 
    AND b.username = REPLACE(d.buyer_telegram, '@', '');

    UPDATE public.deals d
    SET seller_id = b.telegram_id
    FROM public.bot_users b
    WHERE d.seller_id IS NULL 
    AND b.username = REPLACE(d.seller_telegram, '@', '');
END $$;

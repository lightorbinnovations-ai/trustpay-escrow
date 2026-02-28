-- Add market_listing_id to deals to link back to the Market app
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS market_listing_id UUID;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_deals_market_listing_id ON public.deals(market_listing_id);

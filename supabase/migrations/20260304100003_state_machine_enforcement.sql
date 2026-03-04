-- PRODUCTION LOCK 2: State Machine Enforcement
-- This migration ensures that the deal status adheres strictly to the allowed lifecycle transitions.

-- 1. Ensure status is NOT NULL and defaults to 'pending'
ALTER TABLE public.deals 
ALTER COLUMN status SET DEFAULT 'pending',
ALTER COLUMN status SET NOT NULL;

-- 2. Migrate any existing 'funded' deals with delivery timestamps to 'delivered'
UPDATE public.deals
SET status = 'delivered'
WHERE status = 'funded' AND delivered_at IS NOT NULL;

-- 3. Apply CHECK constraint to restrict values
-- Drop constraint if it already exists (useful if re-running)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'check_deal_status' AND table_name = 'deals'
    ) THEN
        ALTER TABLE public.deals DROP CONSTRAINT check_deal_status;
    END IF;
END $$;

ALTER TABLE public.deals
ADD CONSTRAINT check_deal_status 
CHECK (status IN ('pending', 'accepted', 'funded', 'delivered', 'completed', 'cancelled', 'disputed', 'resolved_buyer', 'resolved_seller'));

-- 4. Add index on status for faster querying of active deals
CREATE INDEX IF NOT EXISTS idx_deals_status ON public.deals(status);

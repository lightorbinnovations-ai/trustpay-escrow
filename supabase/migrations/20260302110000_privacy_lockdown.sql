-- Revoke public SELECT access for sensitive tables in the Escrow project.
-- This ensures that private deal and profile data cannot be scraped by unauthenticated clients.
-- All data access should now be mediated by secure Edge Functions.

-- 1. DEALS
DROP POLICY IF EXISTS "Allow public read on deals" ON public.deals;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

-- 2. USER_PROFILES
DROP POLICY IF EXISTS "Allow public read on user_profiles" ON public.user_profiles;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 3. TRANSACTIONS
DROP POLICY IF EXISTS "Allow public read on transactions" ON public.transactions;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 4. LISTINGS (Local Escrow side listings, if any)
DROP POLICY IF EXISTS "Allow public read on listings" ON public.listings;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- 5. AUDIT_LOGS
DROP POLICY IF EXISTS "Allow public read on audit_logs" ON public.audit_logs;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Important: deal_ratings table is NOT locked down for SELECT/INSERT 
-- as it is currently used directly in the MiniApp for public feedback.

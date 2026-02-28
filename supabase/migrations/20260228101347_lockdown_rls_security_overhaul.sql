-- Revoke public insert, update, and delete access for core tables
-- This locks the tables down so only the service_role key (used in backend Edge Functions) can modify data.

-- 1. DEALS
DROP POLICY IF EXISTS "Allow public insert on deals" ON public.deals;
DROP POLICY IF EXISTS "Allow public update on deals" ON public.deals;

-- 2. USER_PROFILES
DROP POLICY IF EXISTS "Allow public insert on user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow public update on user_profiles" ON public.user_profiles;

-- 3. TRANSACTIONS
DROP POLICY IF EXISTS "Allow public insert on transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow public update on transactions" ON public.transactions;

-- 4. LISTINGS
DROP POLICY IF EXISTS "Allow public insert on listings" ON public.listings;
DROP POLICY IF EXISTS "Allow public update on listings" ON public.listings;

-- 5. AUDIT_LOGS
DROP POLICY IF EXISTS "Allow public insert on audit_logs" ON public.audit_logs;

-- Note: We are keeping the "Allow public read" (SELECT) policies intact 
-- so the frontend can still view data seamlessly. Writes must now be done via Edge Functions.

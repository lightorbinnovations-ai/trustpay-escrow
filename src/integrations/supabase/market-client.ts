import { createClient } from '@supabase/supabase-js';

const MARKET_SUPABASE_URL = import.meta.env.VITE_MARKET_SUPABASE_URL;
const MARKET_SUPABASE_ANON_KEY = import.meta.env.VITE_MARKET_SUPABASE_ANON_KEY;

// Secondary client to fetch listing details from the Market project
export const marketSupabase = createClient(MARKET_SUPABASE_URL, MARKET_SUPABASE_ANON_KEY);

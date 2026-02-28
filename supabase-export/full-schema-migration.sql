-- =====================================================
-- TrustPay Escrow - Complete Database Schema Migration
-- Generated: 2026-02-27
-- =====================================================
-- Run this file in your new Supabase project's SQL Editor
-- to recreate the entire database schema.
-- =====================================================

-- =====================================================
-- 1. FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =====================================================
-- 2. TABLES
-- =====================================================

-- Bot Users
CREATE TABLE public.bot_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Profiles
CREATE TABLE public.user_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_username TEXT NOT NULL UNIQUE,
  telegram_chat_id BIGINT,
  account_name TEXT,
  account_number TEXT,
  bank_name TEXT,
  paystack_recipient_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Listings
CREATE TABLE public.listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  price NUMERIC NOT NULL,
  category TEXT,
  city TEXT,
  seller_telegram_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deals
CREATE TABLE public.deals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id TEXT NOT NULL UNIQUE,
  buyer_telegram TEXT NOT NULL,
  seller_telegram TEXT NOT NULL,
  amount INTEGER NOT NULL,
  fee INTEGER NOT NULL DEFAULT 300,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  payment_ref TEXT,
  transfer_ref TEXT,
  paystack_payment_link TEXT,
  delivered_at TIMESTAMPTZ,
  funded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  dispute_reason TEXT,
  dispute_resolved_at TIMESTAMPTZ,
  dispute_resolution TEXT,
  refund_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deal Ratings
CREATE TABLE public.deal_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id TEXT NOT NULL,
  rater_telegram TEXT NOT NULL,
  rated_telegram TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, rater_telegram)
);

-- Transactions
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings(id),
  buyer_telegram_id BIGINT NOT NULL,
  seller_telegram_id BIGINT NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_telegram_id BIGINT NOT NULL,
  sender_telegram_id BIGINT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  listing_id UUID REFERENCES public.listings(id),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit Logs
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id TEXT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Platform Settings
CREATE TABLE public.platform_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.bot_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Bot Users Policies
CREATE POLICY "Allow public insert on bot_users" ON public.bot_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read on bot_users" ON public.bot_users FOR SELECT USING (true);
CREATE POLICY "Allow public update on bot_users" ON public.bot_users FOR UPDATE USING (true);

-- User Profiles Policies
CREATE POLICY "Allow public insert on user_profiles" ON public.user_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read on user_profiles" ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "Allow public update on user_profiles" ON public.user_profiles FOR UPDATE USING (true);

-- Listings Policies
CREATE POLICY "Allow public insert on listings" ON public.listings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read on listings" ON public.listings FOR SELECT USING (true);
CREATE POLICY "Allow public update on listings" ON public.listings FOR UPDATE USING (true);

-- Deals Policies
CREATE POLICY "Allow public insert on deals" ON public.deals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read on deals" ON public.deals FOR SELECT USING (true);
CREATE POLICY "Allow public update on deals" ON public.deals FOR UPDATE USING (true);

-- Deal Ratings Policies
CREATE POLICY "Anyone can insert ratings" ON public.deal_ratings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read ratings" ON public.deal_ratings FOR SELECT USING (true);

-- Transactions Policies
CREATE POLICY "Allow public insert on transactions" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read on transactions" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Allow public update on transactions" ON public.transactions FOR UPDATE USING (true);

-- Notifications Policies
CREATE POLICY "Allow public insert on notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read on notifications" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "Allow public update on notifications" ON public.notifications FOR UPDATE USING (true);

-- Audit Logs Policies
CREATE POLICY "Allow public insert on audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read on audit_logs" ON public.audit_logs FOR SELECT USING (true);

-- Platform Settings Policies
CREATE POLICY "Allow public insert on platform_settings" ON public.platform_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read on platform_settings" ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "Allow public update on platform_settings" ON public.platform_settings FOR UPDATE USING (true);

-- =====================================================
-- 4. REALTIME
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- =====================================================
-- 5. STORAGE
-- =====================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('dispute-evidence', 'dispute-evidence', true);

CREATE POLICY "Anyone can read dispute evidence" ON storage.objects FOR SELECT USING (bucket_id = 'dispute-evidence');
CREATE POLICY "Anyone can upload dispute evidence" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'dispute-evidence');

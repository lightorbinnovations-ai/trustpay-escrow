-- Migration: Add photo_url and full_name to user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Index for searching if needed
CREATE INDEX IF NOT EXISTS idx_user_profiles_full_name ON public.user_profiles(full_name);

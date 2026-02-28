-- Add telegram_id column to user_profiles for unique identification
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS telegram_id BIGINT UNIQUE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_telegram_id ON public.user_profiles(telegram_id);


CREATE TABLE public.user_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_username text NOT NULL UNIQUE,
  telegram_chat_id bigint,
  bank_name text,
  account_number text,
  account_name text,
  paystack_recipient_code text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on user_profiles" ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "Allow public insert on user_profiles" ON public.user_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on user_profiles" ON public.user_profiles FOR UPDATE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles;

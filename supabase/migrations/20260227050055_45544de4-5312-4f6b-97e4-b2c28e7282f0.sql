
-- Create bot_users table
CREATE TABLE public.bot_users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id bigint NOT NULL UNIQUE,
  first_name text,
  username text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on bot_users" ON public.bot_users FOR SELECT USING (true);
CREATE POLICY "Allow public insert on bot_users" ON public.bot_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on bot_users" ON public.bot_users FOR UPDATE USING (true);

-- Create listings table
CREATE TABLE public.listings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text DEFAULT '',
  price numeric NOT NULL,
  category text,
  city text,
  seller_telegram_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'active',
  image_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on listings" ON public.listings FOR SELECT USING (true);
CREATE POLICY "Allow public insert on listings" ON public.listings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on listings" ON public.listings FOR UPDATE USING (true);

-- Create transactions table
CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id uuid REFERENCES public.listings(id),
  buyer_telegram_id bigint NOT NULL,
  seller_telegram_id bigint NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on transactions" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on transactions" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on transactions" ON public.transactions FOR UPDATE USING (true);

-- Create notifications table
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_telegram_id bigint NOT NULL,
  sender_telegram_id bigint,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'general',
  listing_id uuid REFERENCES public.listings(id),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on notifications" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "Allow public insert on notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on notifications" ON public.notifications FOR UPDATE USING (true);

-- Enable realtime for transactions and notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Add updated_at triggers
CREATE TRIGGER update_bot_users_updated_at BEFORE UPDATE ON public.bot_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

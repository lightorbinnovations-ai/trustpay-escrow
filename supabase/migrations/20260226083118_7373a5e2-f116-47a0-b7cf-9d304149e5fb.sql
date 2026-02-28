-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Deals table
CREATE TABLE public.deals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id TEXT NOT NULL UNIQUE,
  buyer_telegram TEXT NOT NULL,
  seller_telegram TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 100 AND amount <= 2000000),
  fee INTEGER NOT NULL DEFAULT 300,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'funded', 'completed', 'disputed', 'refunded')),
  payment_ref TEXT,
  transfer_ref TEXT,
  paystack_payment_link TEXT,
  delivered_at TIMESTAMP WITH TIME ZONE,
  funded_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  dispute_reason TEXT,
  dispute_resolved_at TIMESTAMP WITH TIME ZONE,
  dispute_resolution TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on deals" ON public.deals FOR SELECT USING (true);
CREATE POLICY "Allow public insert on deals" ON public.deals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on deals" ON public.deals FOR UPDATE USING (true);

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit log table
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id TEXT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on audit_logs" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- Platform settings
CREATE TABLE public.platform_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on platform_settings" ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "Allow public update on platform_settings" ON public.platform_settings FOR UPDATE USING (true);
CREATE POLICY "Allow public insert on platform_settings" ON public.platform_settings FOR INSERT WITH CHECK (true);

-- Enable realtime for deals
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;

-- Insert default settings
INSERT INTO public.platform_settings (key, value) VALUES
  ('max_deal_amount', '20000'),
  ('platform_fee_percent', '5'),
  ('min_platform_fee', '300'),
  ('auto_release_hours', '48'),
  ('webhook_validation', 'true');

-- Storage bucket for dispute evidence
INSERT INTO storage.buckets (id, name, public) VALUES ('dispute-evidence', 'dispute-evidence', true) ON CONFLICT (id) DO NOTHING;

-- RLS for dispute-evidence bucket
CREATE POLICY "Anyone can upload dispute evidence" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'dispute-evidence');
CREATE POLICY "Anyone can read dispute evidence" ON storage.objects FOR SELECT USING (bucket_id = 'dispute-evidence');

-- Ratings table
CREATE TABLE public.deal_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id TEXT NOT NULL,
  rater_telegram TEXT NOT NULL,
  rated_telegram TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(deal_id, rater_telegram)
);

ALTER TABLE public.deal_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert ratings" ON public.deal_ratings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read ratings" ON public.deal_ratings FOR SELECT USING (true);

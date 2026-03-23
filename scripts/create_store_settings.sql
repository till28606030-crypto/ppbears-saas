-- Migration: Create store_settings table
-- Purpose: Store global SaaS configuration including GA4 and Google ADS tracking IDs
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.store_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ga4_id      TEXT,
  ads_id      TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert a default empty row so UPSERT works consistently
INSERT INTO public.store_settings (ga4_id, ads_id)
VALUES (NULL, NULL)
ON CONFLICT DO NOTHING;

-- RLS: only authenticated users (admins) can read/write
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON public.store_settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated write" ON public.store_settings
  FOR ALL USING (auth.role() = 'authenticated');

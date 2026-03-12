-- AI Usage Log Table
-- Purpose: Server-side IP-based daily usage tracking (incognito-proof)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS ai_usage_log (
    id BIGSERIAL PRIMARY KEY,
    ip TEXT NOT NULL,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    product_id TEXT,
    count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ip, usage_date)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_ip_date ON ai_usage_log(ip, usage_date);

-- Enable RLS
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write (backend only, no direct client access)
CREATE POLICY "service_role_all" ON ai_usage_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Optional: auto-clean old records (keep 30 days)
-- CREATE OR REPLACE FUNCTION cleanup_old_ai_usage()
-- RETURNS void AS $$
-- BEGIN
--   DELETE FROM ai_usage_log WHERE usage_date < CURRENT_DATE - INTERVAL '30 days';
-- END;
-- $$ LANGUAGE plpgsql;

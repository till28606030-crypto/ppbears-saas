-- ============================================================
--  Migration: Admin Preferences + SaaS Tenant Tables
--  Date: 2026-03-18
--  Description:
--    Phase 1: admin_preferences — stores per-user admin nav
--             order and custom labels server-side (replaces
--             localStorage, works cross-browser/device).
--    Phase 2: tenants + tenant_users — blank SaaS structure
--             for future multi-tenant monthly subscription.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. Helper: auto-update updated_at timestamp
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 1: admin_preferences
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_preferences (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nav_order   JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- array of menu item ids
  nav_labels  JSONB       NOT NULL DEFAULT '{}'::jsonb,   -- map { id: custom_label }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

DROP TRIGGER IF EXISTS admin_preferences_updated_at ON admin_preferences;
CREATE TRIGGER admin_preferences_updated_at
  BEFORE UPDATE ON admin_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: users can only read/write their own row
ALTER TABLE admin_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_prefs_select" ON admin_preferences;
CREATE POLICY "admin_prefs_select" ON admin_preferences
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_prefs_insert" ON admin_preferences;
CREATE POLICY "admin_prefs_insert" ON admin_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_prefs_update" ON admin_preferences;
CREATE POLICY "admin_prefs_update" ON admin_preferences
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_prefs_delete" ON admin_preferences;
CREATE POLICY "admin_prefs_delete" ON admin_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- PHASE 2: tenants (每間店家)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT        NOT NULL,
  slug                    TEXT        UNIQUE NOT NULL,
  plan                    TEXT        NOT NULL DEFAULT 'trial'
                            CHECK (plan IN ('trial','basic','pro','enterprise')),
  status                  TEXT        NOT NULL DEFAULT 'trial'
                            CHECK (status IN ('trial','active','suspended','cancelled')),
  trial_ends_at           TIMESTAMPTZ,
  subscription_expires_at TIMESTAMPTZ,
  settings                JSONB       NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tenants_updated_at ON tenants;
CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- PHASE 2: tenant_users (帳號 <-> 店家)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'admin'
                CHECK (role IN ('owner','admin','member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- ─────────────────────────────────────────────────────────────
-- PHASE 2 prep: add tenant_id to admin_preferences
-- (nullable for now; will be required once multi-tenant is live)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE admin_preferences
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- Done.
-- To verify:
--   SELECT * FROM admin_preferences LIMIT 1;
--   SELECT * FROM tenants LIMIT 1;
--   SELECT * FROM tenant_users LIMIT 1;
-- ─────────────────────────────────────────────────────────────

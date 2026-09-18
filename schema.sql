-- Give, Get, Grateful — D1 schema
-- Apply with:
--   npx wrangler d1 execute ggg-signups --remote --file=./schema.sql
-- (drop --remote to apply to the local dev database)

CREATE TABLE IF NOT EXISTS signups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL,          -- stored lowercased + trimmed
  name          TEXT,
  interest      TEXT    NOT NULL,          -- 'book' | 'consulting' | 'both'
  organization  TEXT,
  message       TEXT,
  source        TEXT,                      -- utm_source, ref, or referrer host
  country       TEXT,                      -- from Cloudflare request.cf
  ip_hash       TEXT,                      -- salted SHA-256; never the raw IP
  user_agent    TEXT,
  unsubscribed  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- One row per person. Re-submissions update the existing row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_signups_email ON signups (email);

-- Supports the per-IP rate limit check.
CREATE INDEX IF NOT EXISTS idx_signups_iphash_created ON signups (ip_hash, created_at);

-- Supports the export endpoint's ordering.
CREATE INDEX IF NOT EXISTS idx_signups_created ON signups (created_at);

-- ========================================================================
-- Supabase Schema Setup for Golf League Signup
-- ========================================================================
-- Run this SQL in your Supabase dashboard (SQL Editor)
-- Steps:
--   1. Go to Supabase dashboard
--   2. Click "SQL Editor" in left sidebar
--   3. Click "New query"
--   4. Copy and paste this entire file
--   5. Click "Run"
-- ========================================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. Weeks table (manages which week is open)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weeks (
  week_key TEXT PRIMARY KEY,  -- "2026-W26" format
  opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP,
  b_groups_unlocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weeks_opened_at ON weeks(opened_at DESC);

-- ────────────────────────────────────────────────────────────────────────
-- 2. Update weekly_players table (if it exists) or create it
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_players (
  id BIGSERIAL PRIMARY KEY,
  week_number TEXT NOT NULL,  -- "2026-W26" format, references weeks.week_key
  player_name TEXT NOT NULL,
  player_email TEXT,          -- NULL for guest players
  hole_number TEXT NOT NULL,  -- "1"-"9" or "1B"-"9B"
  hole_group TEXT NOT NULL,   -- "A" or "B"
  signup_id TEXT UNIQUE,      -- Identifier for the primary signup group
  is_guest BOOLEAN DEFAULT FALSE,
  primary_player_email TEXT,  -- Links guest to their primary player
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  signed_up_at TIMESTAMP DEFAULT NOW(),
  
  -- Foreign key to weeks table
  CONSTRAINT fk_week_number FOREIGN KEY (week_number) REFERENCES weeks(week_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_weekly_players_week ON weekly_players(week_number);
CREATE INDEX IF NOT EXISTS idx_weekly_players_email ON weekly_players(player_email);
CREATE INDEX IF NOT EXISTS idx_weekly_players_signup_id ON weekly_players(signup_id);
CREATE INDEX IF NOT EXISTS idx_weekly_players_hole ON weekly_players(hole_number, hole_group);

-- ────────────────────────────────────────────────────────────────────────
-- 3. Admin settings table (stores PIN and current week)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed default admin settings
INSERT INTO admin_settings (key, value) VALUES ('current_week_key', '')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO admin_settings (key, value) VALUES ('admin_pin', '')
  ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- 4. Verify tables exist (optional - just for testing)
-- ────────────────────────────────────────────────────────────────────────
-- Run this query to verify everything is set up:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema='public' 
-- AND table_name IN ('weeks', 'weekly_players', 'admin_settings');

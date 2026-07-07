-- ========================================================================
-- Multi-Tenancy Migration for Golf League Signup
-- ========================================================================
-- Run this in Supabase SQL Editor to add league isolation

-- ────────────────────────────────────────────────────────────────────────
-- 1. Create leagues table
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leagues (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leagues_slug ON leagues(slug);

-- ────────────────────────────────────────────────────────────────────────
-- 2. Create league_admins table
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_admins (
  id BIGSERIAL PRIMARY KEY,
  league_id BIGINT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  admin_email TEXT NOT NULL,
  admin_pin TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_league_admins_league_email 
  ON league_admins(league_id, admin_email);
CREATE INDEX IF NOT EXISTS idx_league_admins_league_id ON league_admins(league_id);

-- ────────────────────────────────────────────────────────────────────────
-- 3. Add league_id to weeks table
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE weeks ADD COLUMN IF NOT EXISTS league_id BIGINT REFERENCES leagues(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_weeks_league_id ON weeks(league_id);

-- ────────────────────────────────────────────────────────────────────────
-- 4. Add league_id to weekly_players table
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE weekly_players ADD COLUMN IF NOT EXISTS league_id BIGINT REFERENCES leagues(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_weekly_players_league_id ON weekly_players(league_id);

-- ────────────────────────────────────────────────────────────────────────
-- 5. Add league_id to weekly_players_audit_log table
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE weekly_players_audit_log ADD COLUMN IF NOT EXISTS league_id BIGINT REFERENCES leagues(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_audit_log_league_id ON weekly_players_audit_log(league_id);

-- ────────────────────────────────────────────────────────────────────────
-- 6. Create player_history table with league_id
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_history (
  id BIGSERIAL PRIMARY KEY,
  league_id BIGINT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player_email TEXT NOT NULL,
  player_name TEXT NOT NULL,
  total_rounds INT DEFAULT 0,
  last_signup_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_history_league_email ON player_history(league_id, player_email);
CREATE INDEX IF NOT EXISTS idx_player_history_league_id ON player_history(league_id);

-- ────────────────────────────────────────────────────────────────────────
-- 7. Seed test leagues (uncomment and modify as needed)
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO leagues (slug, name, owner_email) VALUES
  ('southeast', 'Southeast League', 'ross@goodwell.net'),
  ('northside', 'Northside League', 'ross@goodwell.net')
ON CONFLICT (slug) DO NOTHING;

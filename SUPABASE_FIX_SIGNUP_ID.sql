-- ========================================================================
-- Migration: Fix signup_id constraint to allow primary + guest grouping
-- ========================================================================
-- The signup_id should be a group identifier (primary + guests), not unique per row.
-- This migration removes the UNIQUE constraint and adds proper constraints instead.
-- 
-- Steps to apply:
-- 1. Go to Supabase dashboard → SQL Editor
-- 2. Copy and paste this entire file
-- 3. Click "Run"
-- ========================================================================

-- Drop the existing UNIQUE constraint on signup_id
ALTER TABLE weekly_players DROP CONSTRAINT IF EXISTS weekly_players_signup_id_key;

-- Add a unique constraint: each primary player email can only sign up once per week
-- (This allows guests with NULL email to exist for that primary player)
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_players_week_email_primary 
  ON weekly_players(week_number, player_email) 
  WHERE is_guest = false AND player_email IS NOT NULL;

-- Add a non-unique index on signup_id for fast lookups (group queries)
CREATE INDEX IF NOT EXISTS idx_weekly_players_signup_id 
  ON weekly_players(signup_id);

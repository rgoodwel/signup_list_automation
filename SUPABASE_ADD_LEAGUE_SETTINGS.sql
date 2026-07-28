-- ========================================================================
-- Add League Settings to Leagues Table
-- ========================================================================
-- This migration adds league-specific configuration options
-- Run this in Supabase SQL Editor

-- ────────────────────────────────────────────────────────────────────────
-- Add league settings columns to leagues table
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS day_of_week TEXT DEFAULT 'Monday';
-- Values: 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS description TEXT;
-- Optional league description displayed to players

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS requires_password BOOLEAN DEFAULT FALSE;
-- If true, players must enter a password to view league/signup

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS password TEXT;
-- The password required to access the league (hashed in production)

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS require_email BOOLEAN DEFAULT TRUE;
-- If true, email address is required from all players

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS require_phone BOOLEAN DEFAULT TRUE;
-- If true, phone number is required from all players

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS require_additional_player_info BOOLEAN DEFAULT TRUE;
-- If false, additional players only require a name (email/phone become optional)
-- If true, additional players follow require_email/require_phone settings like primary players

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS default_open_holes INTEGER NOT NULL DEFAULT 9;
-- How many A-group holes are open for signup by default

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS allow_b_groups BOOLEAN NOT NULL DEFAULT TRUE;
-- If true, B-group holes can unlock once the default holes are nearly full

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS b_hole_unlock_sequence TEXT;
-- Comma-delimited B-hole numbers defining unlock order (example: 5,1,3,2)

-- Update existing leagues to have sensible defaults if they were created before this migration
UPDATE leagues SET day_of_week = 'Monday' WHERE day_of_week IS NULL;

-- ========================================================================
-- Fix PRIMARY KEY for weeks table in multi-tenant setup
-- ========================================================================
-- The weeks table had week_key as PRIMARY KEY, but with multiple leagues,
-- multiple rows can have the same week_key. This migration:
-- 1. Adds an id column as the new PRIMARY KEY
-- 2. Creates a UNIQUE constraint on (league_id, week_key)
-- 3. Keeps the composite unique index intact

-- Step 1: Add the new id column as PRIMARY KEY
ALTER TABLE weeks 
  ADD COLUMN id BIGSERIAL PRIMARY KEY;

-- Step 2: Drop the old week_key primary key constraint (if it exists)
ALTER TABLE weeks 
  DROP CONSTRAINT IF EXISTS weeks_pkey;

-- Step 3: Make week_key+league_id the unique identifier
ALTER TABLE weeks 
  ADD CONSTRAINT uq_weeks_league_week_key UNIQUE (league_id, week_key);

-- Step 4: Ensure indexes are in place for performance
CREATE INDEX IF NOT EXISTS idx_weeks_league_week_key ON weeks(league_id, week_key);
CREATE INDEX IF NOT EXISTS idx_weeks_league_id ON weeks(league_id);
CREATE INDEX IF NOT EXISTS idx_weeks_opened_at ON weeks(opened_at DESC);

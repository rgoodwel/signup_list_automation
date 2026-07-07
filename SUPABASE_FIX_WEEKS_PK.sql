-- ========================================================================
-- Fix PRIMARY KEY for weeks table in multi-tenant setup
-- ========================================================================
-- The weeks table had week_key as PRIMARY KEY, but with multiple leagues,
-- multiple rows can have the same week_key. This migration:
-- 1. Drops the old week_key PRIMARY KEY constraint (with CASCADE)
-- 2. Adds an id column as the new PRIMARY KEY
-- 3. Creates a UNIQUE constraint on (league_id, week_key)
-- 4. Ensures indexes are in place for performance

-- Step 1: Drop the old week_key primary key constraint with CASCADE
-- (CASCADE drops dependent foreign key constraints)
ALTER TABLE weeks 
  DROP CONSTRAINT weeks_pkey CASCADE;

-- Step 2: Add the new id column as PRIMARY KEY
ALTER TABLE weeks 
  ADD COLUMN id BIGSERIAL PRIMARY KEY;

-- Step 3: Make week_key+league_id the unique identifier
ALTER TABLE weeks 
  ADD CONSTRAINT uq_weeks_league_week_key UNIQUE (league_id, week_key);

-- Step 4: Recreate the foreign key constraint (week_number -> weeks.week_key still works as UNIQUE)
ALTER TABLE weekly_players
  ADD CONSTRAINT fk_week_number FOREIGN KEY (week_number) 
    REFERENCES weeks(week_key) ON DELETE CASCADE;

-- Step 5: Ensure indexes are in place for performance
CREATE INDEX IF NOT EXISTS idx_weeks_league_week_key ON weeks(league_id, week_key);
CREATE INDEX IF NOT EXISTS idx_weeks_league_id ON weeks(league_id);
CREATE INDEX IF NOT EXISTS idx_weeks_opened_at ON weeks(opened_at DESC);

-- ========================================================================
-- Recreate weeks table with proper multi-tenant schema
-- ========================================================================
-- Drops the old weeks table and recreates it with:
-- 1. id as PRIMARY KEY (BIGSERIAL)
-- 2. league_id as foreign key to leagues table
-- 3. Composite UNIQUE constraint on (league_id, week_key)
-- 4. All original columns preserved

-- Step 1: Drop the old weeks table (CASCADE removes dependent objects)
DROP TABLE IF EXISTS weeks CASCADE;

-- Step 2: Recreate weeks table with proper schema
CREATE TABLE weeks (
  id BIGSERIAL PRIMARY KEY,
  league_id BIGINT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,
  opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP,
  b_groups_unlocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Composite unique constraint: each league has unique week_keys
  CONSTRAINT uq_weeks_league_week_key UNIQUE (league_id, week_key)
);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_weeks_league_id ON weeks(league_id);
CREATE INDEX IF NOT EXISTS idx_weeks_league_week_key ON weeks(league_id, week_key);
CREATE INDEX IF NOT EXISTS idx_weeks_opened_at ON weeks(opened_at DESC);

-- Step 4: Recreate the foreign key from weekly_players to weeks
-- Use composite key (league_id, week_number) to match the unique constraint
ALTER TABLE weekly_players
  DROP CONSTRAINT IF EXISTS fk_week_number;

ALTER TABLE weekly_players
  ADD CONSTRAINT fk_week_number FOREIGN KEY (league_id, week_number) 
    REFERENCES weeks(league_id, week_key) ON DELETE CASCADE;

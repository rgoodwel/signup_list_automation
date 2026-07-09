-- Add finalized_at column to weeks table to track when a week is closed/completed
-- This allows distinguishing between:
-- - locked (closed_at set): week prevents new signups but is still "current"
-- - finalized (finalized_at set): week is closed and no longer current

ALTER TABLE weeks ADD COLUMN finalized_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for faster queries when filtering by finalized_at
CREATE INDEX idx_weeks_finalized_at ON weeks(league_id, finalized_at);

-- Update comment
COMMENT ON COLUMN weeks.finalized_at IS 'When set, indicates the week is completed and no longer current. Used to distinguish from closed_at which just locks signups.';

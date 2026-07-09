-- Add phone number field to weekly_players table
-- Allows storage of primary player phone numbers for contact purposes

ALTER TABLE weekly_players
ADD COLUMN player_phone VARCHAR(20);

-- Create index on player_phone for faster lookups if needed
CREATE INDEX idx_weekly_players_phone 
ON weekly_players(league_id, player_phone) 
WHERE player_phone IS NOT NULL;

-- Add comment documenting the field
COMMENT ON COLUMN weekly_players.player_phone IS 'Phone number of the primary player (guests do not have phone numbers stored)';

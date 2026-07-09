-- Add phone number field to weekly_players table and remove guest designation
-- All players now have their own contact information (email and phone)

ALTER TABLE weekly_players
ADD COLUMN player_phone VARCHAR(20);

-- Remove is_guest column - all players are now treated equally
ALTER TABLE weekly_players
DROP COLUMN IF EXISTS is_guest;

-- Create index on player_phone for faster lookups if needed
CREATE INDEX idx_weekly_players_phone 
ON weekly_players(league_id, player_phone) 
WHERE player_phone IS NOT NULL;

-- Add comment documenting the field
COMMENT ON COLUMN weekly_players.player_phone IS 'Phone number of the player (all players in a signup now have their own contact information)';

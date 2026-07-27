-- Add setting to control whether additional players must provide contact info
-- Default TRUE preserves existing behavior.

ALTER TABLE public.leagues
ADD COLUMN IF NOT EXISTS require_additional_player_info boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.leagues.require_additional_player_info IS
'If true, additional players must provide email/phone according to require_email/require_phone. If false, additional players only require name.';

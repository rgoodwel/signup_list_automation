-- Add league settings for default open holes and B-group availability
-- Default values preserve current behavior: first 6 holes open, B groups allowed.

ALTER TABLE public.leagues
ADD COLUMN IF NOT EXISTS default_open_holes integer NOT NULL DEFAULT 9,
ADD COLUMN IF NOT EXISTS allow_b_groups boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.leagues.default_open_holes IS
'How many A-group holes are open for signup by default.';

COMMENT ON COLUMN public.leagues.allow_b_groups IS
'If true, B-group holes can unlock once the default holes are nearly full.';
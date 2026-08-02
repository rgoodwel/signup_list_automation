-- Add league visibility setting to control whether a league appears on the public selector.

ALTER TABLE public.leagues
ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

UPDATE public.leagues
SET is_public = true
WHERE is_public IS NULL;

COMMENT ON COLUMN public.leagues.is_public IS
'If true, the league is listed on the main app page. If false, it is hidden from the public selector.';

-- Add field visibility columns to leagues table
-- Controls whether email and phone fields are shown in the signup form
-- Default to true (show fields) for backward compatibility

ALTER TABLE public.leagues
ADD COLUMN show_email boolean NOT NULL DEFAULT true,
ADD COLUMN show_phone boolean NOT NULL DEFAULT true;

-- Comment for clarity
COMMENT ON COLUMN public.leagues.show_email IS 'Whether to display email field in signup form. If false, field is hidden regardless of require_email setting.';
COMMENT ON COLUMN public.leagues.show_phone IS 'Whether to display phone field in signup form. If false, field is hidden regardless of require_phone setting.';

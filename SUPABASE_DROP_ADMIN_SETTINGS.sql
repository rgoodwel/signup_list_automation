-- ========================================================================
-- Drop admin_settings table (no longer needed in multi-tenant setup)
-- ========================================================================
-- Previously used for global admin PIN and current week tracking
-- Now replaced by:
-- - league_admins table: per-league admin PIN management
-- - weeks table: per-league week management

DROP TABLE IF EXISTS admin_settings CASCADE;

-- Verify table is removed
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema='public' 
-- AND table_name = 'admin_settings';

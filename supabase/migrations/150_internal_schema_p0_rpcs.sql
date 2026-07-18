-- =============================================================================
-- 150 — Fase 3 P0: schema internal + mover RPCs solo-server
-- =============================================================================
-- Mueve fuera de public (Data API por defecto):
--   sap_sync_tx, sap_sync_matches_tx, refresh_enterprise_summary_views
--
-- Dashboard (obligatorio tras aplicar):
--   Project Settings → API → Exposed schemas → añadir `internal`
--   (anon/authenticated no tienen EXECUTE; solo service_role)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS internal;

REVOKE ALL ON SCHEMA internal FROM PUBLIC;
REVOKE ALL ON SCHEMA internal FROM anon, authenticated;
GRANT USAGE ON SCHEMA internal TO postgres, service_role;

COMMENT ON SCHEMA internal IS
  'RPCs SECURITY DEFINER no orientados a browser. Solo service_role. CHG-014.';

-- Mover por nombre (todas las sobrecargas DEFINER en public)
DO $$
DECLARE
  r record;
  v_names text[] := ARRAY[
    'sap_sync_tx',
    'sap_sync_matches_tx',
    'refresh_enterprise_summary_views'
  ];
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (v_names)
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET SCHEMA internal',
      r.proname,
      r.args
    );
    RAISE NOTICE '150: moved public.%(%) → internal', r.proname, r.args;
  END LOOP;
END $$;

-- Grants: solo service_role
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'internal'
      AND p.proname = ANY (ARRAY[
        'sap_sync_tx',
        'sap_sync_matches_tx',
        'refresh_enterprise_summary_views'
      ])
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION internal.%I(%s) FROM PUBLIC, anon, authenticated',
      r.proname,
      r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION internal.%I(%s) TO service_role',
      r.proname,
      r.args
    );
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA internal
  GRANT EXECUTE ON FUNCTIONS TO service_role;

NOTIFY pgrst, 'reload schema';

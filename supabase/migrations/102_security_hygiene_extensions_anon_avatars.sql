-- =============================================================================
-- 102 — Higiene de seguridad (Dashboard advisor + grants)
-- =============================================================================
-- 1) Mover pg_trgm de public → extensions (si está en public y es relocatable).
-- 2) Revocar EXECUTE de anon en SECURITY DEFINER; re-conceder solo zk_ingest.
-- 3) Endurecer escrituras del bucket avatars (propietario por carpeta userId/).
-- 4) Revocar app_has_role a anon (no debe usarse sin sesión).
--
-- Dashboard (manual, no SQL): Authentication → Providers → Email →
--   "Leaked password protection" = ON
-- Reversible: ver bloque DOWN al final.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) pg_trgm → schema extensions
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
DECLARE
  v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  IF v_schema IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
    RAISE NOTICE '102: pg_trgm creado en extensions';
  ELSIF v_schema = 'public' THEN
    BEGIN
      ALTER EXTENSION pg_trgm SET SCHEMA extensions;
      RAISE NOTICE '102: pg_trgm movido public → extensions';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '102: no se pudo mover pg_trgm (%). Dejar manual / soporte.', SQLERRM;
    END;
  ELSE
    RAISE NOTICE '102: pg_trgm ya en schema %', v_schema;
  END IF;
END $$;

GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Anon: sin EXECUTE en DEFINER, excepto zk_ingest_attlog_tx
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
      r.name,
      r.args
    );
  END LOOP;
END $$;

-- Dispositivos ZKTeco (iclock) siguen sin sesión de usuario.
GRANT EXECUTE ON FUNCTION public.zk_ingest_attlog_tx(text, jsonb) TO anon;

REVOKE EXECUTE ON FUNCTION public.app_has_role(public.app_role) FROM anon;

-- ---------------------------------------------------------------------------
-- 3) Storage avatars — escrituras solo en carpeta propia {uid}/...
--    SELECT público se mantiene (URLs públicas de perfil).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update/delete avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;
DROP POLICY IF EXISTS avatars_public_select ON storage.objects;
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;

CREATE POLICY avatars_public_select
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY avatars_insert_own
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_update_own
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_delete_own
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOWN (rollback):
-- -----------------------------------------------------------------------------
-- -- Avatars (permisivo anterior)
-- drop policy if exists avatars_public_select on storage.objects;
-- drop policy if exists avatars_insert_own on storage.objects;
-- drop policy if exists avatars_update_own on storage.objects;
-- drop policy if exists avatars_delete_own on storage.objects;
-- create policy "Public Access" on storage.objects for select using (bucket_id = 'avatars');
-- create policy "Authenticated users can upload avatars" on storage.objects for insert
--   with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
-- create policy "Authenticated users can update/delete avatars" on storage.objects for update
--   using (bucket_id = 'avatars' and auth.role() = 'authenticated');
-- create policy "Authenticated users can delete avatars" on storage.objects for delete
--   using (bucket_id = 'avatars' and auth.role() = 'authenticated');
--
-- grant execute on function public.app_has_role(public.app_role) to anon;
-- -- pg_trgm: alter extension pg_trgm set schema public;  (si aplica)
-- =============================================================================

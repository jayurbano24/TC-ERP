-- 139: Security Advisor — search_path + cerrar EXECUTE de anon en SECURITY DEFINER.
--
-- Postgres otorga EXECUTE a PUBLIC por defecto; GRANT a authenticated no quita anon.
-- Patrón existente: 074 / 102 / 110.
--
-- NO quita EXECUTE a authenticated en RPCs de negocio (la app los llama con sesión).
-- El WARN 0029 para authenticated es esperado mientras los RPC vivan en public.
--
-- Auth dashboard (manual): habilitar Leaked Password Protection.
-- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

-- ---------------------------------------------------------------------------
-- 1) search_path fijo (lint 0011)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.warehouse_box_is_bodega_operational(p_rack text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    upper(coalesce(trim(p_rack), '')) NOT IN ('ELIMINADO', 'DESPACHO')
    AND upper(coalesce(trim(p_rack), '')) NOT LIKE 'TALLER%'
    AND upper(coalesce(trim(p_rack), '')) <> 'SCRAP';
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_box_is_bodega_operational(text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Revoke PUBLIC/anon en todo SECURITY DEFINER de public; re-grant autenticados
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
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
      r.name,
      r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
      r.name,
      r.args
    );
  END LOOP;
END $$;

-- ZKTeco iclock: sin sesión de usuario (excepción documentada en 102)
GRANT EXECUTE ON FUNCTION public.zk_ingest_attlog_tx(text, jsonb) TO anon;

-- Triggers: no deben ser RPC REST
DO $$
BEGIN
  IF to_regprocedure('public.boxes_assign_box_code_tg()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.boxes_assign_box_code_tg()
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.boxes_assign_box_code_tg()
      TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

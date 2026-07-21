-- =============================================================================
-- 161 — Restaurar EXECUTE authenticated en create_or_get_sap_transfer_document
-- =============================================================================
-- La migración 149 la clasificó como categoría C (interna) y revocó authenticated.
-- La app la llama desde el browser (Backoffice CAC → sapTransfers.ts .rpc()).
-- La función es SECURITY DEFINER y exige auth.uid(); es categoría A.
-- =============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_or_get_sap_transfer_document'
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.create_or_get_sap_transfer_document(%s) TO authenticated, service_role',
      r.args
    );
    RAISE NOTICE '161: granted authenticated on create_or_get_sap_transfer_document(%)', r.args;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

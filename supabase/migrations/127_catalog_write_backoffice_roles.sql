-- =============================================================================
-- 127 — Catálogos (models/brands/technologies/agencies): escritura backoffice
--
-- Causa: migración 110 dejó models_write_ops solo admin/supervisor.
-- BACKOFFICE* se mapea a receptor_cac (107); pueden ver Configuración pero
-- el INSERT en models falla con RLS.
--
-- Solución: permitir receptor_cac y receptor_px (backoffice CAC/PX) en
-- escritura de catálogos maestros.
-- =============================================================================

DO $$
DECLARE
  t text;
  write_pred text := $p$
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
    OR public.app_has_role('receptor_px')
  $p$;
BEGIN
  FOREACH t IN ARRAY ARRAY['agencies', 'brands', 'models', 'technologies']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write_ops', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      t || '_write_ops', t, write_pred, write_pred
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

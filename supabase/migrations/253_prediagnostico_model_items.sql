-- 253 — Perfil de ítems de pre-diagnóstico por modelo (allowlist opcional).

CREATE TABLE IF NOT EXISTS public.cat_prediagnostico_model_items (
  model_id uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.cat_prediagnostico_items(id) ON DELETE CASCADE,
  PRIMARY KEY (model_id, item_id)
);

CREATE INDEX IF NOT EXISTS cat_prediagnostico_model_items_model_idx
  ON public.cat_prediagnostico_model_items (model_id);

ALTER TABLE public.cat_prediagnostico_model_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cat_prediagnostico_model_items_read ON public.cat_prediagnostico_model_items;
CREATE POLICY cat_prediagnostico_model_items_read ON public.cat_prediagnostico_model_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cat_prediagnostico_model_items_write ON public.cat_prediagnostico_model_items;
CREATE POLICY cat_prediagnostico_model_items_write ON public.cat_prediagnostico_model_items
  FOR ALL TO authenticated
  USING (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
  )
  WITH CHECK (
    public.app_is_admin()
    OR public.app_has_role('admin')
    OR public.app_has_role('supervisor')
    OR public.app_has_role('receptor_cac')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cat_prediagnostico_model_items TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

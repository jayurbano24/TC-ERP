-- 241 — Diagnóstico ↔ Tecnología(s): fallas aplicables por tecnología (multi-select en Configuración).

CREATE TABLE IF NOT EXISTS public.cat_diagnostic_technologies (
  diagnostic_id uuid NOT NULL REFERENCES public.cat_diagnostics(id) ON DELETE CASCADE,
  technology_id uuid NOT NULL REFERENCES public.technologies(id) ON DELETE CASCADE,
  PRIMARY KEY (diagnostic_id, technology_id)
);

CREATE INDEX IF NOT EXISTS idx_cat_diagnostic_technologies_technology
  ON public.cat_diagnostic_technologies (technology_id);

ALTER TABLE public.cat_diagnostic_technologies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cat_diagnostic_technologies_read ON public.cat_diagnostic_technologies;
CREATE POLICY cat_diagnostic_technologies_read ON public.cat_diagnostic_technologies
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS cat_diagnostic_technologies_write ON public.cat_diagnostic_technologies;
CREATE POLICY cat_diagnostic_technologies_write ON public.cat_diagnostic_technologies
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

COMMENT ON TABLE public.cat_diagnostic_technologies IS
  'Tecnologías donde aplica cada falla/diagnóstico. Sin filas = aplica a todas las tecnologías.';

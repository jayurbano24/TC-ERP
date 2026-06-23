-- FIX MÍNIMO: recepciones tablet Backoffice (BACKOFFICES) — sin funciones nuevas.
-- Ejecutar TODO este bloque en Supabase SQL Editor.

-- 1) receptions
DROP POLICY IF EXISTS receptions_auth_fallback ON public.receptions;
CREATE POLICY receptions_auth_fallback ON public.receptions
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2) reception_guides (por si acaso)
DROP POLICY IF EXISTS reception_guides_auth_fallback ON public.reception_guides;
CREATE POLICY reception_guides_auth_fallback ON public.reception_guides
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3) boxes
DROP POLICY IF EXISTS boxes_auth_fallback ON public.boxes;
CREATE POLICY boxes_auth_fallback ON public.boxes
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4) series
DROP POLICY IF EXISTS series_auth_fallback ON public.series;
CREATE POLICY series_auth_fallback ON public.series
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 5) box_series / reception_findings (RLS sin políticas = bloqueo total)
DROP POLICY IF EXISTS box_series_auth_fallback ON public.box_series;
CREATE POLICY box_series_auth_fallback ON public.box_series
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS reception_findings_auth_fallback ON public.reception_findings;
CREATE POLICY reception_findings_auth_fallback ON public.reception_findings
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Verificación (debe listar receptions_auth_fallback):
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('receptions', 'reception_guides', 'boxes', 'series')
ORDER BY tablename, policyname;

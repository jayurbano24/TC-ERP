-- Fix RLS: recepciones tablet — políticas auth_fallback (sin erp_roles ni funciones extra)

DROP POLICY IF EXISTS receptions_auth_fallback ON public.receptions;
CREATE POLICY receptions_auth_fallback ON public.receptions
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS reception_guides_auth_fallback ON public.reception_guides;
CREATE POLICY reception_guides_auth_fallback ON public.reception_guides
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS boxes_auth_fallback ON public.boxes;
CREATE POLICY boxes_auth_fallback ON public.boxes
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS series_auth_fallback ON public.series;
CREATE POLICY series_auth_fallback ON public.series
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

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

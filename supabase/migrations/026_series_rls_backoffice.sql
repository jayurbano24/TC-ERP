-- Series: upsert al clasificar equipos (INSERT + UPDATE en conflicto)

  DROP POLICY IF EXISTS series_auth_fallback ON public.series;
  CREATE POLICY series_auth_fallback ON public.series
    FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

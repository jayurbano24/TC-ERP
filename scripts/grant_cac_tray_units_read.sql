-- Lectura de bandeja CAC desde el dashboard (cliente browser / authenticated)
GRANT SELECT ON public.cac_tray_units TO authenticated, service_role;

ALTER TABLE public.cac_tray_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cac_tray_units_select_authenticated ON public.cac_tray_units;
CREATE POLICY cac_tray_units_select_authenticated
  ON public.cac_tray_units
  FOR SELECT
  TO authenticated, service_role
  USING (true);

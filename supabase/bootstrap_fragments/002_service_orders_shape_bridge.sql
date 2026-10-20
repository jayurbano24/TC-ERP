-- 001 define service_orders ligado a series_id; 010 define el modelo operativo (main_serial).
-- Instalación limpia: quitar el cascarón legacy vacío para que 010 cree la tabla correcta.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_orders' AND column_name = 'series_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_orders' AND column_name = 'main_serial'
  ) THEN
    DROP TABLE IF EXISTS public.qc_checks CASCADE;
    DROP TABLE IF EXISTS public.workshop_jobs CASCADE;
    DROP TABLE IF EXISTS public.service_orders CASCADE;
  END IF;
END $$;

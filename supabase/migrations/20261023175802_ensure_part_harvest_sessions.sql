-- =============================================================================
-- ensure_part_harvest_sessions (compatibilidad reconstrucción desde cero)
--
-- Causa raíz:
--   20261023175803_part_harvest_cases.sql ALTER TABLE part_harvest_sessions
--   ordena léxicamente ANTES de 271_part_harvest_from_scrap.sql (CREATE TABLE).
--   En prod la tabla ya existía al aplicar el fix; en reset limpio → 42P01.
--
-- Estrategia: CREATE TABLE IF NOT EXISTS idéntico al núcleo de 271 (idempotente).
-- 271 permanece SSOT canónica (líneas, RLS, grants, CHECK de part_movements).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.part_harvest_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  series_id uuid REFERENCES public.series(id) ON DELETE SET NULL,
  serial_number text,
  donor_status text NOT NULL,
  rack_location text,
  os_label text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_harvest_sessions_os
  ON public.part_harvest_sessions (service_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_part_harvest_sessions_series
  ON public.part_harvest_sessions (series_id) WHERE series_id IS NOT NULL;

COMMENT ON TABLE public.part_harvest_sessions IS
  '20261023175802: puente CREATE IF NOT EXISTS para installs frescos; '
  'definición canónica y RLS en 271_part_harvest_from_scrap.sql.';

NOTIFY pgrst, 'reload schema';

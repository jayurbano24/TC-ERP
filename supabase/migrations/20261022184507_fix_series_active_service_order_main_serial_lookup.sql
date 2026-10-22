-- =============================================================================
-- fix_series_active_service_order_main_serial_lookup
--
-- Root cause (prod evidence):
--   series_active_service_order UNION ALL main_serial branch used
--   normalize_equipment_serial(so.main_serial) without a usable index path.
--   EXPLAIN showed Seq Scan on service_orders (~86k rows, 5–8s) even when
--   idx_so_main_serial_equipment_normalized existed (expression index unused
--   by planner). series.serial_normalized branch was already fast (<1ms).
--   New-equipment classify hits the miss path for every serial → multi-minute RPC.
--
-- Fix:
--   1) Persist main_serial_normalized (same semantics as normalize_equipment_serial)
--   2) B-tree indexes the planner can use with equality + open-OS predicate
--   3) Rewrite lookup as plpgsql with early return after series hit
--   4) ANALYZE
-- =============================================================================

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS main_serial_normalized text;

UPDATE public.service_orders so
SET main_serial_normalized = public.normalize_equipment_serial(so.main_serial)
WHERE so.main_serial_normalized IS DISTINCT FROM public.normalize_equipment_serial(so.main_serial);

CREATE OR REPLACE FUNCTION public.trg_service_orders_main_serial_normalized()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.main_serial_normalized := public.normalize_equipment_serial(NEW.main_serial);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_orders_main_serial_normalized ON public.service_orders;
CREATE TRIGGER trg_service_orders_main_serial_normalized
  BEFORE INSERT OR UPDATE OF main_serial
  ON public.service_orders
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_service_orders_main_serial_normalized();

-- Non-partial equality index (planner-friendly).
CREATE INDEX IF NOT EXISTS idx_so_main_serial_normalized_eq
  ON public.service_orders (main_serial_normalized)
  WHERE main_serial_normalized IS NOT NULL
    AND main_serial_normalized <> '';

-- Open-OS slice for active lookup (matches function predicate).
CREATE INDEX IF NOT EXISTS idx_so_main_serial_normalized_open
  ON public.service_orders (main_serial_normalized)
  WHERE main_serial_normalized IS NOT NULL
    AND main_serial_normalized <> ''
    AND NOT public.service_order_status_is_closed(status);

-- Ensure series.serial_normalized column index exists under the expected name/expression.
CREATE INDEX IF NOT EXISTS idx_series_serial_normalized_eq
  ON public.series (serial_normalized)
  WHERE serial_normalized IS NOT NULL
    AND serial_normalized <> '';

CREATE OR REPLACE FUNCTION public.series_active_service_order(p_serial text)
RETURNS TABLE (
  service_order_id uuid,
  os_label text,
  status text,
  series_status text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_sn text;
BEGIN
  IF NOT public.is_valid_equipment_serial(p_serial) THEN
    RETURN;
  END IF;

  v_sn := public.normalize_equipment_serial(p_serial);
  IF v_sn IS NULL OR v_sn = '' THEN
    RETURN;
  END IF;

  -- Fast path: series.serial_normalized (already indexed in prod).
  RETURN QUERY
  SELECT
    so.id,
    so.os_label,
    so.status,
    s.current_status::text
  FROM public.series s
  JOIN public.service_orders so ON so.id = s.service_order_id
  WHERE s.serial_normalized = v_sn
    AND s.serial_normalized IS NOT NULL
    AND s.serial_normalized <> ''
    AND s.service_order_id IS NOT NULL
    AND NOT public.series_status_is_terminal(s.current_status::text)
    AND NOT public.service_order_status_is_closed(so.status)
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Miss / main-only path: equality on stored normalized column + open predicate.
  RETURN QUERY
  SELECT
    so.id,
    so.os_label,
    so.status,
    NULL::text
  FROM public.service_orders so
  WHERE so.main_serial_normalized = v_sn
    AND so.main_serial_normalized IS NOT NULL
    AND so.main_serial_normalized <> ''
    AND NOT public.service_order_status_is_closed(so.status)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.series_active_service_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.series_active_service_order(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.series_active_service_order(text) IS
  'OS activa por serial: series.serial_normalized then service_orders.main_serial_normalized (index equality).';

ANALYZE public.service_orders;
ANALYZE public.series;

NOTIFY pgrst, 'reload schema';

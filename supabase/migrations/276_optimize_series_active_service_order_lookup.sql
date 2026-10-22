-- =============================================================================
-- optimize_series_active_service_order_lookup (orden lex > 275 / post-274)
--
-- series_active_service_order usaba normalize_equipment_serial(column) en JOIN
-- → seq scan (~220k series). Usar serial_normalized (097) + índice en main_serial.
-- normalize_equipment_serial / normalize_serial son IMMUTABLE (274).
-- =============================================================================

ALTER TABLE public.series
  ADD COLUMN IF NOT EXISTS serial_normalized text;

UPDATE public.series
SET serial_normalized = public.normalize_serial(serial_number)
WHERE serial_normalized IS NULL
   OR serial_normalized <> public.normalize_serial(serial_number);

CREATE INDEX IF NOT EXISTS idx_series_serial_normalized
  ON public.series (serial_normalized)
  WHERE serial_normalized IS NOT NULL AND serial_normalized <> '';

CREATE INDEX IF NOT EXISTS idx_series_serial_normalized_active_lookup
  ON public.series (serial_normalized, service_order_id, current_status)
  WHERE serial_normalized IS NOT NULL
    AND serial_normalized <> ''
    AND service_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_so_main_serial_equipment_normalized
  ON public.service_orders (public.normalize_equipment_serial(main_serial))
  WHERE main_serial IS NOT NULL
    AND public.is_valid_equipment_serial(main_serial);

CREATE OR REPLACE FUNCTION public.series_active_service_order(p_serial text)
RETURNS TABLE (
  service_order_id uuid,
  os_label text,
  status text,
  series_status text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH sn AS (
    SELECT public.normalize_equipment_serial(p_serial) AS serial
    WHERE public.is_valid_equipment_serial(p_serial)
  )
  SELECT
    so.id,
    so.os_label,
    so.status,
    s.current_status::text
  FROM sn
  JOIN public.series s ON s.serial_normalized = sn.serial
  JOIN public.service_orders so ON so.id = s.service_order_id
  WHERE NOT public.service_order_status_is_closed(so.status)
    AND NOT public.series_status_is_terminal(s.current_status::text)

  UNION ALL

  SELECT
    so.id,
    so.os_label,
    so.status,
    NULL::text
  FROM sn
  JOIN public.service_orders so
    ON public.normalize_equipment_serial(so.main_serial) = sn.serial
  WHERE NOT public.service_order_status_is_closed(so.status)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.series_active_service_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.series_active_service_order(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.series_active_service_order(text) IS
  'OS activa por serial normalizado (series.serial_normalized + índice en main_serial).';

ANALYZE public.series;
ANALYZE public.service_orders;

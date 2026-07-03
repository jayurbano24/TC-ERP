-- =============================================================================
-- 088 — Vistas materializadas de resumen (Fase 3 — dashboards sin full scan)
-- Aditivo: si el refresh falla, las pantallas siguen usando RPC/vistas live.
-- =============================================================================

-- Bodega: resumen por caja (refresco periódico vía cron o pg_cron)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_bodega_inventory AS
SELECT
  b.id AS box_id,
  b.box_code,
  b.rack_location,
  b.status,
  count(s.id)::integer AS series_count,
  max(s.updated_at) AS last_series_update
FROM public.boxes b
LEFT JOIN public.series s ON s.current_box_id = b.id
WHERE upper(coalesce(b.rack_location, '')) NOT IN ('DESPACHO', 'ELIMINADO')
GROUP BY b.id, b.box_code, b.rack_location, b.status;

CREATE UNIQUE INDEX IF NOT EXISTS mv_bodega_inventory_box_id
  ON public.mv_bodega_inventory (box_id);

-- Taller: cola diagnóstico por OS
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_workshop_diagnostico AS
SELECT
  s.service_order_id,
  so.os_label,
  count(*)::integer AS series_count,
  min(s.serial_number) AS sample_serial,
  max(s.updated_at) AS last_updated
FROM public.series s
JOIN public.service_orders so ON so.id = s.service_order_id
WHERE s.current_status::text = 'in_workshop'
  AND s.service_order_id IS NOT NULL
GROUP BY s.service_order_id, so.os_label;

CREATE UNIQUE INDEX IF NOT EXISTS mv_workshop_diagnostico_so_id
  ON public.mv_workshop_diagnostico (service_order_id);

-- Función de refresh (llamar desde cron/worker; CONCURRENTLY requiere UNIQUE index)
CREATE OR REPLACE FUNCTION public.refresh_enterprise_summary_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_bodega_inventory;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_workshop_diagnostico;
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback sin CONCURRENTLY si es la primera población
    REFRESH MATERIALIZED VIEW public.mv_bodega_inventory;
    REFRESH MATERIALIZED VIEW public.mv_workshop_diagnostico;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_enterprise_summary_views() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_enterprise_summary_views() TO service_role;

NOTIFY pgrst, 'reload schema';

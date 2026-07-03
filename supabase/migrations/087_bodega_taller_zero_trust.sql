-- =============================================================================
-- 087 — Bodega → Taller: índices, RPC cola OS, contadores (Zero-Trust aditivo)
-- Sin cambios destructivos de RLS — compatible con operación en curso.
-- Depende de: 065 (app_can), 082–086 (warehouse_*_tx + idempotency)
-- =============================================================================

-- ── Índices de rendimiento ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_series_status_updated
  ON public.series (current_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_series_box_status
  ON public.series (current_box_id)
  WHERE current_box_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_series_so_status
  ON public.series (service_order_id, current_status)
  WHERE service_order_id IS NOT NULL;

-- ── Contador por OS (badge Taller sin paginar series en cliente) ─────────────
CREATE OR REPLACE FUNCTION public.count_workshop_os_by_status(p_status text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(DISTINCT s.service_order_id)::integer
  FROM public.series s
  WHERE s.current_status::text = p_status
    AND s.service_order_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.count_workshop_os_by_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_workshop_os_by_status(text) TO authenticated, service_role;

-- ── Cola taller agrupada por OS (proyección mínima, cursor paginado) ─────────
CREATE OR REPLACE FUNCTION public.workshop_list_os_queue_page(
  p_status text,
  p_cursor uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  service_order_id uuid,
  os_label text,
  series_count integer,
  sample_serial text,
  last_updated timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH grouped AS (
    SELECT
      s.service_order_id,
      so.os_label,
      count(*)::integer AS series_count,
      min(s.serial_number) AS sample_serial,
      max(s.updated_at) AS last_updated
    FROM public.series s
    JOIN public.service_orders so ON so.id = s.service_order_id
    WHERE s.current_status::text = p_status
      AND s.service_order_id IS NOT NULL
    GROUP BY s.service_order_id, so.os_label
  )
  SELECT g.service_order_id, g.os_label, g.series_count, g.sample_serial, g.last_updated
  FROM grouped g
  WHERE (p_cursor IS NULL OR g.service_order_id > p_cursor)
  ORDER BY g.service_order_id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.workshop_list_os_queue_page(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workshop_list_os_queue_page(text, uuid, integer) TO authenticated, service_role;

-- ── Conteos multi-pestaña taller (1 round-trip) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.count_workshop_os_all_tabs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'diagnostico',     (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_workshop' AND service_order_id IS NOT NULL),
    'reparacion',      (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_qc' AND service_order_id IS NOT NULL),
    'qc',              (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_validation' AND service_order_id IS NOT NULL),
    'reacondicionado', (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'ready_to_dispatch' AND service_order_id IS NOT NULL),
    'l3',              (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_control_warehouse' AND service_order_id IS NOT NULL),
    'scraps',          (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'irreparable' AND service_order_id IS NOT NULL)
  );
$$;

REVOKE ALL ON FUNCTION public.count_workshop_os_all_tabs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_workshop_os_all_tabs() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

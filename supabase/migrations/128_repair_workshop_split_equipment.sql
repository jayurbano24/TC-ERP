-- =============================================================================
-- 128 — Reparar equipos de taller partidos (series hermanas en distintas etapas)
--
-- Síntoma: al avanzar a QC solo se movió 1 serie → la OS aparece en Reparación
-- y en Control de Calidad a la vez.
--
-- Acción: por cada service_order con series en pipeline de taller en más de un
-- estado, alinear TODAS al estado más avanzado del grupo.
-- =============================================================================

DO $$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH ranked AS (
    SELECT
      s.id,
      s.service_order_id,
      s.current_status::text AS st,
      CASE s.current_status::text
        WHEN 'in_workshop' THEN 1
        WHEN 'in_qc' THEN 2
        WHEN 'in_validation' THEN 3
        WHEN 'ready_to_dispatch' THEN 4
        WHEN 'in_control_warehouse' THEN 5
        WHEN 'in_central_warehouse' THEN 6
        ELSE 0
      END AS rank
    FROM public.series s
    WHERE s.service_order_id IS NOT NULL
      AND s.current_status::text IN (
        'in_workshop',
        'in_qc',
        'in_validation',
        'ready_to_dispatch',
        'in_control_warehouse',
        'in_central_warehouse'
      )
  ),
  os_max AS (
    SELECT
      service_order_id,
      MAX(rank) AS max_rank
    FROM ranked
    WHERE rank > 0
    GROUP BY service_order_id
    HAVING COUNT(DISTINCT st) > 1
  ),
  target AS (
    SELECT
      m.service_order_id,
      CASE m.max_rank
        WHEN 1 THEN 'in_workshop'
        WHEN 2 THEN 'in_qc'
        WHEN 3 THEN 'in_validation'
        WHEN 4 THEN 'ready_to_dispatch'
        WHEN 5 THEN 'in_control_warehouse'
        WHEN 6 THEN 'in_central_warehouse'
      END AS target_status
    FROM os_max m
  ),
  upd AS (
    UPDATE public.series s
    SET
      current_status = t.target_status::public.series_status,
      updated_at = now()
    FROM target t
    WHERE s.service_order_id = t.service_order_id
      AND s.current_status::text IN (
        'in_workshop',
        'in_qc',
        'in_validation',
        'ready_to_dispatch',
        'in_control_warehouse',
        'in_central_warehouse'
      )
      AND s.current_status::text IS DISTINCT FROM t.target_status
    RETURNING s.id
  )
  SELECT COUNT(*)::integer INTO v_updated FROM upd;

  RAISE NOTICE '128 workshop split repair: % series alineadas', v_updated;
END $$;

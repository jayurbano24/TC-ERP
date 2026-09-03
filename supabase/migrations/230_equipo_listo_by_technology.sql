-- =============================================================================
-- 230 — Equipo Listo: conteo de OS por tecnología (misma regla audit que listo).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.count_equipo_listo_by_technology()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH listo_os AS (
    SELECT
      s.service_order_id,
      (array_agg(s.model_id) FILTER (WHERE s.model_id IS NOT NULL))[1] AS model_id
    FROM public.series s
    WHERE s.current_status::text = 'in_central_warehouse'
      AND s.service_order_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.erp_audit_logs al
        WHERE al.record_id = s.id::text
          AND al.action IN (
            'INGRESO A TALLER',
            'DIAGNÓSTICO INICIAL COMPLETADO',
            'REPARACIÓN COMPLETADA',
            'REPARACIÓN L3 COMPLETADA',
            'CONTROL DE CALIDAD COMPLETADO',
            'REACONDICIONADO COMPLETADO',
            'TRASLADO MASIVO A TALLER'
          )
      )
    GROUP BY s.service_order_id
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'technology_id', x.technology_id,
        'tech_name', x.tech_name,
        'total_os', x.total_os
      )
      ORDER BY x.tech_name
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      t.id AS technology_id,
      coalesce(nullif(trim(t.name), ''), 'SIN TECNOLOGÍA') AS tech_name,
      count(*)::integer AS total_os
    FROM listo_os lo
    LEFT JOIN public.models m ON m.id = lo.model_id
    LEFT JOIN public.technologies t ON t.id = m.technology_id
    GROUP BY t.id, coalesce(nullif(trim(t.name), ''), 'SIN TECNOLOGÍA')
  ) x;
$$;

REVOKE ALL ON FUNCTION public.count_equipo_listo_by_technology() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_equipo_listo_by_technology() TO authenticated, service_role;

COMMENT ON FUNCTION public.count_equipo_listo_by_technology() IS
  'OS en Equipo Listo (in_central_warehouse + auditoría taller) agrupadas por tecnología.';

NOTIFY pgrst, 'reload schema';

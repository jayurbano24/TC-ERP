-- 248 — Equipo Listo: alinear workshop_list_listo_os_page con count_workshop_os_all_tabs (231).
-- - Incluye REPARACIÓN L3 COMPLETADA en auditoría válida.
-- - Paginación por max(updated_at) por OS (HAVING), no por fila suelta (evita OS omitidas).

CREATE OR REPLACE FUNCTION public.workshop_list_listo_os_page(
  p_cursor timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(service_order_id uuid, sort_ts timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    s.service_order_id,
    max(s.updated_at) AS sort_ts
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
  HAVING (p_cursor IS NULL OR max(s.updated_at) < p_cursor)
  ORDER BY max(s.updated_at) DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

REVOKE ALL ON FUNCTION public.workshop_list_listo_os_page(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workshop_list_listo_os_page(timestamptz, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.workshop_list_listo_os_page(timestamptz, integer) IS
  'Cola paginada Equipo Listo: in_central_warehouse + auditoría taller (sync 231/248).';

NOTIFY pgrst, 'reload schema';

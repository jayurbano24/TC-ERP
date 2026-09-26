-- 249 — Equipo Listo: cursor (updated_at, os id) para no saltar OS con el mismo timestamp.
-- La función 248 recortaba p_limit a 200. El cliente pide limit+1 y, al no recibir
-- esa fila, cortaba la cola en las 200 OS más nuevas (TC-42256 quedaba fuera).

CREATE OR REPLACE FUNCTION public.workshop_list_listo_os_page(
  p_cursor timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor_id uuid DEFAULT NULL
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
  HAVING (
    p_cursor IS NULL
    OR max(s.updated_at) < p_cursor
    OR (
      p_cursor_id IS NOT NULL
      AND max(s.updated_at) = p_cursor
      AND s.service_order_id < p_cursor_id
    )
  )
  ORDER BY max(s.updated_at) DESC, s.service_order_id DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

REVOKE ALL ON FUNCTION public.workshop_list_listo_os_page(timestamptz, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workshop_list_listo_os_page(timestamptz, integer, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.workshop_list_listo_os_page(timestamptz, integer, uuid) IS
  'Cola paginada Equipo Listo. Cursor (sort_ts, service_order_id) para empates de updated_at.';

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- 113 — Cola paginada "Equipo Listo" (evita scan masivo in_central_warehouse)
-- =============================================================================
-- La pestaña listo cargaba TODAS las series en bodega + auditoría por chunk de
-- erp_audit_logs → "Sincronizando..." eterno. Este RPC lista solo OS con
-- auditoría de taller (mismo criterio que count_workshop_os_all_tabs).
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_erp_audit_record_action
  ON public.erp_audit_logs (record_id, action);

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
          'CONTROL DE CALIDAD COMPLETADO',
          'REACONDICIONADO COMPLETADO',
          'TRASLADO MASIVO A TALLER'
        )
    )
    AND (p_cursor IS NULL OR s.updated_at < p_cursor)
  GROUP BY s.service_order_id
  ORDER BY max(s.updated_at) DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

REVOKE ALL ON FUNCTION public.workshop_list_listo_os_page(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workshop_list_listo_os_page(timestamptz, integer)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

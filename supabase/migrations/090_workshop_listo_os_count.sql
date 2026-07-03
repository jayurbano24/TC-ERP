-- =============================================================================
-- 090 — Conteo "Equipo Listo" por OS en SQL (elimina scan de erp_audit_logs en cliente)
-- Extiende count_workshop_os_all_tabs con pestaña listo.
-- =============================================================================

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
    'scraps',          (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'irreparable' AND service_order_id IS NOT NULL),
    'listo', (
      SELECT count(DISTINCT s.service_order_id)::integer
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
    )
  );
$$;

REVOKE ALL ON FUNCTION public.count_workshop_os_all_tabs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_workshop_os_all_tabs() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

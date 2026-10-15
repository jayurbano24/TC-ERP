-- 257 — count_workshop_os_all_tabs: SECURITY DEFINER para conteos estables bajo RLS (231 body).

CREATE OR REPLACE FUNCTION public.count_workshop_os_all_tabs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'diagnostico',     (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_workshop' AND service_order_id IS NOT NULL),
    'reparacion',      (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_qc' AND service_order_id IS NOT NULL),
    'esperando_partes',(SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'waiting_parts' AND service_order_id IS NOT NULL),
    'qc',              (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_validation' AND service_order_id IS NOT NULL),
    'reacondicionado', (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'ready_to_dispatch' AND service_order_id IS NOT NULL),
    'l3',              (SELECT count(DISTINCT service_order_id) FROM public.series WHERE current_status::text = 'in_control_warehouse' AND service_order_id IS NOT NULL),
    'scraps',          (
      SELECT count(DISTINCT s.service_order_id)
      FROM public.series s
      WHERE s.current_status::text = 'irreparable'
        AND s.service_order_id IS NOT NULL
        AND s.current_box_id IS NULL
        AND NOT public.series_os_has_scrap_box(s.service_order_id)
    ),
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
              'REPARACIÓN L3 COMPLETADA',
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

COMMENT ON FUNCTION public.count_workshop_os_all_tabs() IS
  'Conteos OS por pestaña Taller (DEFINER — evita 500 por RLS en erp_audit_logs/series).';

NOTIFY pgrst, 'reload schema';

-- 067: Vista Resumen de Cajas de Bodega para carga paginada (Phase 2 - Egress Bodega)
-- Reduce drásticamente el egress al listar las cajas sin traer todo el detalle de series.

CREATE OR REPLACE VIEW public.warehouse_box_summary AS
SELECT
  b.id                          AS box_id,
  b.rack_location               AS rack,
  b.box_code                    AS label,
  COUNT(s.id)                   AS series_count,
  (ARRAY_AGG(s.current_status ORDER BY s.created_at))[1]      AS sample_status,
  (ARRAY_AGG(s.brand_id ORDER BY s.created_at))[1]            AS sample_brand_id,
  (ARRAY_AGG(s.model_id ORDER BY s.created_at))[1]            AS sample_model_id,
  (ARRAY_AGG(s.service_order_id ORDER BY s.created_at))[1]    AS sample_service_order_id,
  MAX(s.updated_at)             AS last_movement_at
FROM public.boxes b
LEFT JOIN public.series s ON s.current_box_id = b.id
GROUP BY b.id, b.rack_location, b.box_code;

-- Asegurar que la vista respeta el RLS del invocador, no del creador (prevención de bypass)
ALTER VIEW public.warehouse_box_summary SET (security_invoker = true);

-- Otorgar permiso de lectura a roles autenticados
GRANT SELECT ON public.warehouse_box_summary TO authenticated, service_role;

-- Refrescar caché del schema en PostgREST
NOTIFY pgrst, 'reload schema';

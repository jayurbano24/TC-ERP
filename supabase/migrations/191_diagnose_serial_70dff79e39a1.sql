-- 191: Diagnóstico serie 70DFF79E39A1 (Consulta vacía + PX “Serie duplicada”).
-- Solo lectura. Ajusta el literal SN si repites para otra serie.

-- OS activa según misma regla que PX (classify)
SELECT *
FROM public.series_active_service_order('70DFF79E39A1');

-- Series / OS / estados
SELECT
  s.id,
  s.serial_number,
  s.serial_normalized,
  s.s2,
  s.s3,
  s.s4,
  s.current_status,
  s.service_order_id,
  so.os_label,
  so.main_serial,
  so.status AS os_status,
  so.reception_id,
  so.sap_transfer_id
FROM public.series s
LEFT JOIN public.service_orders so ON so.id = s.service_order_id
WHERE upper(btrim(s.serial_number)) = '70DFF79E39A1'
   OR coalesce(s.serial_normalized, '') = '70DFF79E39A1'
   OR upper(btrim(coalesce(s.s2, ''))) = '70DFF79E39A1'
   OR upper(btrim(coalesce(s.s3, ''))) = '70DFF79E39A1'
   OR upper(btrim(coalesce(s.s4, ''))) = '70DFF79E39A1'
   OR s.service_order_id IN (
     SELECT id FROM public.service_orders
     WHERE upper(btrim(main_serial)) = '70DFF79E39A1'
   );

-- Si hay OS abierta y el equipo ya está despachado/terminal → cierre automático (descomentar tras revisar):
-- UPDATE public.service_orders so
-- SET status = 'DESPACHADO', closed_at = coalesce(closed_at, now())
-- WHERE id = '<UUID_OS>'
--   AND NOT public.service_order_status_is_closed(so.status)
--   AND EXISTS (
--     SELECT 1 FROM public.series s
--     WHERE s.service_order_id = so.id
--       AND public.series_status_is_terminal(s.current_status::text)
--   );

-- 191b: Búsqueda amplia 70DFF79E* (Consulta vacía + PX duplicada).
-- Si todo vacío → la serie NO está en TC; el bloqueo PX suele ser duplicado EN EL MISMO lote PX.

-- 1) OS activa (regla classify) — varias formas del SN
SELECT 'active'::text AS src, a.*
FROM public.series_active_service_order('70DFF79E39A1') a
UNION ALL
SELECT 'active_2192', a.*
FROM public.series_active_service_order('70DFF79E2192') a;

-- 2) Cualquier coincidencia parcial en series / OS
SELECT 'series'::text AS src, s.serial_number, s.s2, s.s3, s.s4, s.current_status,
       so.os_label, so.main_serial, so.status AS os_status
FROM public.series s
LEFT JOIN public.service_orders so ON so.id = s.service_order_id
WHERE upper(coalesce(s.serial_number, '')) LIKE '%70DFF79E%'
   OR upper(coalesce(s.s2, '')) LIKE '%70DFF79E%'
   OR upper(coalesce(s.s3, '')) LIKE '%70DFF79E%'
   OR upper(coalesce(s.s4, '')) LIKE '%70DFF79E%'
   OR upper(coalesce(so.main_serial, '')) LIKE '%70DFF79E%'
LIMIT 50;

-- 3) Bandeja CAC (si existe fila por serial_numbers[])
SELECT 'cac_tray'::text AS src, t.os_label, t.unit_status, t.serial_numbers, t.model_id
FROM public.cac_tray_units t
WHERE t.search_text ILIKE '%70DFF79E%'
   OR EXISTS (
     SELECT 1 FROM unnest(t.serial_numbers) sn
     WHERE upper(sn) LIKE '%70DFF79E%'
   )
LIMIT 20;

-- 4) PX recepción en curso (equipos aún no clasificados a OS)
DO $$
BEGIN
  IF to_regclass('public.px_reception_equipment') IS NOT NULL THEN
    RAISE NOTICE 'px_reception_equipment: revisar en Results si el editor ejecuta SELECT dinámico';
  END IF;
END $$;

-- Si px_reception_equipment existe, ejecutar aparte:
-- SELECT e.main_serial, e.serial_s2, e.serial_s3, e.serial_s4, e.status, l.lot_code
-- FROM public.px_reception_equipment e
-- JOIN public.px_reception_lots l ON l.id = e.lot_id
-- WHERE upper(coalesce(e.main_serial, '')) LIKE '%70DFF79E%'
--    OR upper(coalesce(e.serial_s2, '')) LIKE '%70DFF79E%'
--    OR upper(coalesce(e.serial_s3, '')) LIKE '%70DFF79E%'
--    OR upper(coalesce(e.serial_s4, '')) LIKE '%70DFF79E%';

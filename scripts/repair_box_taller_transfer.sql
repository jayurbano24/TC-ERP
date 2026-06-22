-- Reparar traslado incompleto de caja a Taller (BOX-1 u otra)
-- Caso: quedó 1 OS/serie en bodega porque solo se actualizó current_box_id
--       y no las series hermanas (S-2, S-3, S-4) de la misma OS.

-- 1) Diagnóstico BOX-1
SELECT
  so.os_label,
  s.serial_number,
  s.current_status,
  b.box_code,
  b.rack_location
FROM public.series s
LEFT JOIN public.boxes b ON b.id = s.current_box_id
LEFT JOIN public.service_orders so ON so.id = s.service_order_id
WHERE b.box_code = 'BOX-1'
   OR so.id IN (
     SELECT DISTINCT s2.service_order_id
     FROM public.series s2
     JOIN public.boxes b2 ON b2.id = s2.current_box_id
     WHERE b2.box_code = 'BOX-1' AND s2.service_order_id IS NOT NULL
   )
ORDER BY so.os_label, s.created_at;

-- 2) Mover TODA la OS vinculada a BOX-1 a taller (incluye hermanas sin caja)
WITH box_os AS (
  SELECT DISTINCT s.service_order_id AS os_id
  FROM public.series s
  JOIN public.boxes b ON b.id = s.current_box_id
  WHERE b.box_code = 'BOX-1'
    AND s.service_order_id IS NOT NULL
)
UPDATE public.series s
SET current_status = 'in_workshop'
FROM box_os o
WHERE s.service_order_id = o.os_id
  AND s.current_status IN ('in_central_warehouse', 'in_control_warehouse');

-- 3) Rack de la caja → taller
UPDATE public.boxes
SET rack_location = 'TALLER-DIAGNOSTICO'
WHERE box_code = 'BOX-1'
  AND rack_location NOT ILIKE 'TALLER%';

-- 4) Verificar (debe ser 0 filas en bodega para BOX-1)
SELECT so.os_label, s.serial_number, s.current_status, b.box_code
FROM public.series s
LEFT JOIN public.service_orders so ON so.id = s.service_order_id
LEFT JOIN public.boxes b ON b.id = s.current_box_id
WHERE s.current_status IN ('in_central_warehouse', 'in_control_warehouse')
  AND (
    b.box_code = 'BOX-1'
    OR so.id IN (
      SELECT DISTINCT s2.service_order_id
      FROM public.series s2
      JOIN public.boxes b2 ON b2.id = s2.current_box_id
      WHERE b2.box_code = 'BOX-1' AND s2.service_order_id IS NOT NULL
    )
  );

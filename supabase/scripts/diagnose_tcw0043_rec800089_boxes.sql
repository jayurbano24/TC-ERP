-- =============================================================================
-- Seguimiento TCW0043 / REC-800089 → cajas BOX-1875..1879
-- Schema: boxes.reception_id (NO current_reception_id)
-- =============================================================================

-- 1) Recepción / guía REC-800089
SELECT
  r.id AS reception_id,
  r.guide_number,
  r.status,
  r.source,
  r.created_at,
  r.sap_document,
  r.notes
FROM public.receptions r
WHERE r.guide_number ILIKE '%REC-800089%'
   OR r.guide_number ILIKE '%800089%'
   OR coalesce(r.sap_document, '') ILIKE '%TCW0043%'
ORDER BY r.created_at DESC;

-- 2) Cajas 1875-1879 (+ cajas de esa recepción si existen)
SELECT
  b.id,
  b.box_code,
  b.rack_location,
  b.status,
  b.capacity,
  b.reception_id,
  b.created_at,
  (SELECT count(*) FROM public.series s WHERE s.current_box_id = b.id) AS series_now
FROM public.boxes b
WHERE regexp_replace(upper(btrim(b.box_code)), '\s+', '', 'g') IN (
        'BOX-1875', 'BOX-1876', 'BOX-1877', 'BOX-1878', 'BOX-1879'
      )
   OR b.reception_id IN (
        SELECT id FROM public.receptions
        WHERE guide_number ILIKE '%800089%'
           OR coalesce(sap_document, '') ILIKE '%TCW0043%'
      )
ORDER BY b.box_code;

-- 3) Series que ESTÁN en esas cajas ahora
SELECT
  b.box_code,
  s.serial_number,
  s.current_status::text,
  so.os_label,
  s.updated_at
FROM public.boxes b
JOIN public.series s ON s.current_box_id = b.id
LEFT JOIN public.service_orders so ON so.id = s.service_order_id
WHERE regexp_replace(upper(btrim(b.box_code)), '\s+', '', 'g') IN (
  'BOX-1875', 'BOX-1876', 'BOX-1877', 'BOX-1878', 'BOX-1879'
)
ORDER BY b.box_code, s.serial_number;

-- 4) Series de la recepción (aunque ya no estén en caja)
SELECT
  s.serial_number,
  s.current_status::text,
  s.current_box_id,
  b.box_code AS caja_actual,
  s.current_reception_id,
  so.os_label,
  s.created_at,
  s.updated_at
FROM public.series s
LEFT JOIN public.boxes b ON b.id = s.current_box_id
LEFT JOIN public.service_orders so ON so.id = s.service_order_id
WHERE s.current_reception_id IN (
  SELECT id FROM public.receptions
  WHERE guide_number ILIKE '%800089%'
     OR coalesce(sap_document, '') ILIKE '%TCW0043%'
)
ORDER BY b.box_code NULLS LAST, s.serial_number
LIMIT 500;

-- 5) warehouse_movements de las 5 cajas
SELECT
  b.box_code,
  wm.movement_type,
  wm.series_count,
  wm.performed_by_name,
  wm.created_at,
  left(coalesce(wm.notes, ''), 120) AS notes
FROM public.boxes b
JOIN public.warehouse_movements wm ON wm.box_id = b.id
WHERE regexp_replace(upper(btrim(b.box_code)), '\s+', '', 'g') IN (
  'BOX-1875', 'BOX-1876', 'BOX-1877', 'BOX-1878', 'BOX-1879'
)
ORDER BY wm.created_at DESC;

-- 6) Conteos rápidos por caja ★
SELECT
  b.box_code,
  count(s.id) AS series_en_caja,
  count(DISTINCT s.service_order_id) AS os_en_caja
FROM public.boxes b
LEFT JOIN public.series s ON s.current_box_id = b.id
WHERE regexp_replace(upper(btrim(b.box_code)), '\s+', '', 'g') IN (
  'BOX-1875', 'BOX-1876', 'BOX-1877', 'BOX-1878', 'BOX-1879'
)
GROUP BY b.box_code
ORDER BY b.box_code;

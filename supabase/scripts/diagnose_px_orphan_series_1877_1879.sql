-- =============================================================================
-- Relink / rastro: BOX-1877/78/79 tuvieron captura completa (CAJA-4/5/6)
-- pero series_en_caja = 0 tras Finalizar.
-- =============================================================================

-- 1) Equipos de captura por caja (estado actual)
SELECT
  b.box_code,
  e.capture_status,
  count(*) AS n,
  min(e.captured_at) AS first_cap,
  max(e.captured_at) AS last_cap,
  max(e.promoted_at) AS last_promoted
FROM public.boxes b
JOIN public.px_reception_equipment e ON e.box_id = b.id
WHERE regexp_replace(upper(btrim(b.box_code)), '\s+', '', 'g') IN (
  'BOX-1875', 'BOX-1876', 'BOX-1877', 'BOX-1878', 'BOX-1879'
)
GROUP BY b.box_code, e.capture_status
ORDER BY b.box_code, e.capture_status;

-- 2) ¿Dónde están HOY las series de esos equipos? (por main_serial)
SELECT
  b.box_code AS caja_captura,
  e.main_serial,
  e.capture_status,
  e.promoted_service_order_id,
  s.id AS series_id,
  s.current_status::text,
  s.current_box_id,
  b2.box_code AS caja_series_ahora,
  so.os_label,
  s.updated_at
FROM public.boxes b
JOIN public.px_reception_equipment e ON e.box_id = b.id
LEFT JOIN public.series s ON upper(s.serial_number) = upper(e.main_serial)
LEFT JOIN public.boxes b2 ON b2.id = s.current_box_id
LEFT JOIN public.service_orders so ON so.id = coalesce(s.service_order_id, e.promoted_service_order_id)
WHERE regexp_replace(upper(btrim(b.box_code)), '\s+', '', 'g') IN (
  'BOX-1877', 'BOX-1878', 'BOX-1879'
)
ORDER BY
  CASE WHEN s.current_box_id IS DISTINCT FROM b.id THEN 0 ELSE 1 END,
  b.box_code,
  e.main_serial
LIMIT 400;

-- 3) Resumen: misma caja vs otra caja vs sin serie
SELECT
  b.box_code AS caja_captura,
  count(*) AS equipos,
  count(*) FILTER (WHERE s.id IS NULL) AS sin_serie,
  count(*) FILTER (WHERE s.current_box_id = b.id) AS en_esta_caja,
  count(*) FILTER (
    WHERE s.id IS NOT NULL AND s.current_box_id IS DISTINCT FROM b.id
  ) AS en_otra_caja_o_null,
  count(*) FILTER (WHERE s.current_box_id IS NULL AND s.id IS NOT NULL) AS serie_sin_caja
FROM public.boxes b
JOIN public.px_reception_equipment e ON e.box_id = b.id
LEFT JOIN public.series s ON upper(s.serial_number) = upper(e.main_serial)
WHERE regexp_replace(upper(btrim(b.box_code)), '\s+', '', 'g') IN (
  'BOX-1877', 'BOX-1878', 'BOX-1879'
)
GROUP BY b.box_code
ORDER BY b.box_code;

-- 4) Sample de SNs de actividad (CAJA-6 / BOX-1879) — ¿existen en series?
SELECT
  sn.main_serial,
  s.current_status::text,
  b.box_code AS caja_actual,
  so.os_label
FROM (
  VALUES
    ('ZTEATV41203348851'),
    ('ZTEATV41203482571'),
    ('50A5DC449AC0'),
    ('50A5DC8C3CAE'),
    ('70DFF7A245AE')
) AS sn(main_serial)
LEFT JOIN public.series s ON upper(s.serial_number) = upper(sn.main_serial)
LEFT JOIN public.boxes b ON b.id = s.current_box_id
LEFT JOIN public.service_orders so ON so.id = s.service_order_id;

-- 5) Totales recepción REC-800089 / TCW0043
SELECT
  r.guide_number,
  r.status,
  r.received_units,
  r.expected_units,
  (SELECT count(*) FROM public.px_reception_equipment e
   WHERE e.reception_id = r.id) AS eq_total,
  (SELECT count(*) FROM public.px_reception_equipment e
   WHERE e.reception_id = r.id AND e.capture_status = 'promoted') AS eq_promoted,
  (SELECT count(*) FROM public.px_reception_equipment e
   WHERE e.reception_id = r.id AND e.capture_status = 'active') AS eq_active,
  (SELECT count(*) FROM public.px_reception_equipment e
   WHERE e.reception_id = r.id AND e.capture_status = 'voided') AS eq_voided,
  (SELECT count(*) FROM public.series s
   WHERE s.current_reception_id = r.id) AS series_de_recepcion,
  (SELECT count(*) FROM public.series s
   WHERE s.current_reception_id = r.id AND s.current_box_id IS NULL) AS series_sin_caja
FROM public.receptions r
WHERE r.guide_number ILIKE '%800089%'
   OR coalesce(r.sap_document, '') ILIKE '%TCW0043%'
ORDER BY r.created_at DESC
LIMIT 5;

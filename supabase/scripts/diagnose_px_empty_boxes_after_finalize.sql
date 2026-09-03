-- =============================================================================
-- ¿Por qué BOX-1877/78/79 quedaron en 0 tras Finalizar PX (TCW0043 / REC-800089)?
-- =============================================================================

-- A) Estado de las 5 cajas + recepción
SELECT
  b.box_code,
  b.id,
  b.reception_id,
  b.rack_location,
  b.status::text,
  b.capacity,
  b.declared_quantity,
  b.is_partial_box,
  b.partial_box_reason,
  b.created_at,
  b.closed_at,
  r.guide_number,
  r.sap_document,
  r.status AS reception_status
FROM public.boxes b
LEFT JOIN public.receptions r ON r.id = b.reception_id
WHERE regexp_replace(upper(btrim(b.box_code)), '\s+', '', 'g') IN (
  'BOX-1875', 'BOX-1876', 'BOX-1877', 'BOX-1878', 'BOX-1879'
)
ORDER BY b.box_code;

-- B) Captura PX (fuente de verdad ANTES de promover a series)
SELECT
  b.box_code,
  e.capture_status,
  count(*) AS equipos,
  count(*) FILTER (WHERE e.capture_status = 'active') AS active,
  count(*) FILTER (WHERE e.capture_status = 'promoted') AS promoted,
  count(*) FILTER (WHERE e.capture_status = 'voided') AS voided
FROM public.boxes b
LEFT JOIN public.px_reception_equipment e ON e.box_id = b.id
WHERE regexp_replace(upper(btrim(b.box_code)), '\s+', '', 'g') IN (
  'BOX-1875', 'BOX-1876', 'BOX-1877', 'BOX-1878', 'BOX-1879'
)
GROUP BY b.box_code, e.capture_status
ORDER BY b.box_code, e.capture_status;

-- C) Totales por caja en px_reception_equipment (cualquier status)
SELECT
  b.box_code,
  count(e.id) AS equipos_captura,
  count(e.id) FILTER (WHERE e.capture_status = 'promoted') AS promovidos,
  count(e.id) FILTER (WHERE e.capture_status = 'active') AS aún_active,
  count(e.id) FILTER (WHERE e.capture_status IN ('voided', 'deleted', 'cancelled')) AS anulados
FROM public.boxes b
LEFT JOIN public.px_reception_equipment e ON e.box_id = b.id
WHERE regexp_replace(upper(btrim(b.box_code)), '\s+', '', 'g') IN (
  'BOX-1875', 'BOX-1876', 'BOX-1877', 'BOX-1878', 'BOX-1879'
)
GROUP BY b.box_code
ORDER BY b.box_code;

-- D) Series inventariadas vs captura (¿hubo promote a otra caja?)
SELECT
  b.box_code AS caja_captura,
  e.main_serial,
  e.capture_status,
  e.promoted_at,
  s.id AS series_id,
  s.current_box_id,
  b2.box_code AS caja_series_ahora,
  s.current_status::text
FROM public.boxes b
JOIN public.px_reception_equipment e ON e.box_id = b.id
LEFT JOIN public.series s ON upper(s.serial_number) = upper(e.main_serial)
LEFT JOIN public.boxes b2 ON b2.id = s.current_box_id
WHERE regexp_replace(upper(btrim(b.box_code)), '\s+', '', 'g') IN (
  'BOX-1875', 'BOX-1876', 'BOX-1877', 'BOX-1878', 'BOX-1879'
)
ORDER BY b.box_code, e.main_serial
LIMIT 300;

-- E) Actividad PX de esas cajas (cierres / vaciados)
-- Tabla real: px_reception_activity (no existe px_activity_log)
SELECT
  b.box_code,
  a.activity_type,
  a.summary,
  a.created_at,
  a.actor_display_name,
  left(coalesce(a.metadata::text, ''), 200) AS metadata
FROM public.boxes b
JOIN public.px_reception_activity a ON a.box_id = b.id
WHERE regexp_replace(upper(btrim(b.box_code)), '\s+', '', 'g') IN (
  'BOX-1875', 'BOX-1876', 'BOX-1877', 'BOX-1878', 'BOX-1879'
)
ORDER BY a.created_at DESC
LIMIT 100;

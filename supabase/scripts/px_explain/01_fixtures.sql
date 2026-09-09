-- PX EXPLAIN 1/6 — Fixtures (ejecutar primero)
SELECT
  coalesce(
    (SELECT upper(trim(sl.serial_number))
     FROM public.px_reception_serial_lines sl
     ORDER BY sl.equipment_id DESC
     LIMIT 1),
    'PXTEST001'
  ) AS sample_serial,
  coalesce(
    (SELECT r.id
     FROM public.receptions r
     WHERE r.source = 'px'
     ORDER BY r.created_at DESC
     LIMIT 1),
    (SELECT r.id FROM public.receptions r ORDER BY r.created_at DESC LIMIT 1)
  ) AS sample_reception_id,
  coalesce(
    (SELECT b.id
     FROM public.boxes b
     JOIN public.receptions r ON r.id = b.reception_id
     WHERE r.source = 'px'
     ORDER BY b.id DESC
     LIMIT 1),
    (SELECT b.id FROM public.boxes b ORDER BY b.id DESC LIMIT 1)
  ) AS sample_box_id;

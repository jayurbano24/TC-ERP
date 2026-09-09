-- PX EXPLAIN 4/6 — count activos por caja
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*)::integer
FROM public.px_reception_equipment
WHERE box_id = coalesce(
        (SELECT b.id
         FROM public.boxes b
         JOIN public.receptions r ON r.id = b.reception_id
         WHERE r.source = 'px'
         ORDER BY b.id DESC
         LIMIT 1),
        (SELECT b.id FROM public.boxes b ORDER BY b.id DESC LIMIT 1),
        '00000000-0000-0000-0000-000000000000'::uuid
      )
  AND capture_status = 'active';

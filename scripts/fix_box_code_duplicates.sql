-- Diagnóstico y reparación de BOX-xxx duplicados
-- Ejecutar en Supabase SQL Editor antes o junto con migración 040.

-- Duplicados actuales (detalle)
SELECT
  b.box_code,
  b.id,
  b.reception_id,
  b.rack_location,
  b.created_at,
  r.guide_number,
  r.source,
  (SELECT count(*) FROM public.series s WHERE s.current_box_id = b.id) AS series_count
FROM public.boxes b
LEFT JOIN public.receptions r ON r.id = b.reception_id
WHERE b.box_code IN (
  SELECT box_code
  FROM public.boxes
  WHERE box_code ~ '^BOX-[0-9]+$'
    AND coalesce(rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
  GROUP BY box_code
  HAVING count(*) > 1
)
  AND coalesce(b.rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
ORDER BY b.box_code, b.created_at;

-- Resumen
SELECT box_code, count(*) AS n, array_agg(id ORDER BY created_at) AS box_ids
FROM public.boxes
WHERE box_code ~ '^BOX-[0-9]+$'
  AND coalesce(rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
GROUP BY box_code
HAVING count(*) > 1
ORDER BY box_code;

-- Reparar (conserva la caja más antigua; renumerar el resto vía secuencia)
DO $$
DECLARE
  v_row record;
  v_new_code text;
BEGIN
  FOR v_row IN
    SELECT b.id AS box_id
    FROM public.boxes b
    INNER JOIN (
      SELECT box_code
      FROM public.boxes
      WHERE box_code ~ '^BOX-[0-9]+$'
        AND coalesce(rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
      GROUP BY box_code
      HAVING count(*) > 1
    ) d ON d.box_code = b.box_code
    WHERE b.id NOT IN (
      SELECT DISTINCT ON (box_code) id
      FROM public.boxes
      WHERE box_code ~ '^BOX-[0-9]+$'
        AND coalesce(rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
      ORDER BY box_code, created_at ASC
    )
  LOOP
    v_new_code := public.next_box_code();
    RAISE NOTICE 'Renumerando caja % → %', v_row.box_id, v_new_code;
    UPDATE public.boxes SET box_code = v_new_code WHERE id = v_row.box_id;
  END LOOP;
END;
$$;

SELECT setval(
  'public.box_code_seq',
  GREATEST(
    COALESCE(
      (SELECT MAX(
        NULLIF(regexp_replace(box_code, '[^0-9]', '', 'g'), '')::integer
      )
      FROM public.boxes
      WHERE box_code ~ '^BOX-[0-9]+$'),
      0
    ),
    COALESCE((SELECT last_value FROM public.box_code_seq), 0)
  )
);

-- Verificar (debe devolver 0 filas)
SELECT box_code, count(*) AS n
FROM public.boxes
WHERE box_code ~ '^BOX-[0-9]+$'
  AND coalesce(rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO')
GROUP BY box_code
HAVING count(*) > 1;

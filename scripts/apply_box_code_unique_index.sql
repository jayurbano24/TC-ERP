-- Solo crear índice único (ejecutar cuando fix_box_code_duplicates ya devuelve 0 filas)

CREATE UNIQUE INDEX IF NOT EXISTS boxes_box_code_operational_unique
  ON public.boxes (box_code)
  WHERE box_code ~ '^BOX-[0-9]+$'
    AND coalesce(rack_location, '') NOT IN ('ELIMINADO', 'DESPACHO');

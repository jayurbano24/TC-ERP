-- 126: columnas characteristics/comments en accessories (UI bodega/accesorios)
-- Sin estas columnas el select ACCESSORY_SELECT falla con 42703.

ALTER TABLE public.accessories
  ADD COLUMN IF NOT EXISTS characteristics text,
  ADD COLUMN IF NOT EXISTS comments text;

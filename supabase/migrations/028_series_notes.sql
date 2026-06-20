-- Trazabilidad por equipo: devoluciones, timeline en bodega, etc.
ALTER TABLE public.series
  ADD COLUMN IF NOT EXISTS notes text;

-- Campo usado por vistas authz (107) y enriquecimiento bodega; no estaba en 001_initial_schema.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

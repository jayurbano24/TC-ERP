-- 160 — Matriz mensual: columnas Taller; origen vía series.entry_source
-- Ingresado/Taller/Obsoleto = 1 OS (equipo); Reparado/Reacondicionado = auditoría por serie
BEGIN;

INSERT INTO public.report_definitions (code, name, category, description, requires_date_range, columns)
VALUES (
  'OPERACIONES_MENSUAL_TECNOLOGIA',
  'Operaciones mensual por tecnología',
  'Operaciones',
  'Matriz Año/País/Mes/Tecnología: equipos (OS) ingresados/taller/obsoleto; reparado/reacondicionado por serie; origen CAC/PX vía series.entry_source',
  false,
  '["Año","País","Mes","Tecnología","Ingresado CACs","Ingresado PX","Taller CACs","Taller PX","Obsoleto CACs","Obsoleto PX","Reparado CACs","Reparado PX","Reacondicionado CACs","Reacondicionado PX"]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  requires_date_range = EXCLUDED.requires_date_range,
  columns = EXCLUDED.columns,
  is_active = true
RETURNING code, name, columns;

COMMIT;

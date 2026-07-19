-- 155 — Reporte matriz mensual por tecnología (Portal de Reportes)
BEGIN;

INSERT INTO public.report_definitions (code, name, category, description, requires_date_range, columns)
VALUES (
  'OPERACIONES_MENSUAL_TECNOLOGIA',
  'Operaciones mensual por tecnología',
  'Operaciones',
  'Matriz Año/País/Mes/Tecnología: ingresos CAC/PX, obsoleto, reparado y reacondicionado',
  false,
  '["Año","País","Mes","Tecnología","Ingresado CACs","Ingresado PX","Obsoleto CACs","Obsoleto PX","Reparado CACs","Reparado PX","Reacondicionado CACs","Reacondicionado PX"]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  requires_date_range = EXCLUDED.requires_date_range,
  columns = EXCLUDED.columns,
  is_active = true;

COMMIT;

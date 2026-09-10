-- 242 — Reporte CENAM Refurbished (4 libros Excel)
BEGIN;

INSERT INTO public.report_definitions (code, name, category, description, requires_date_range, columns)
VALUES (
  'CENAM_REFURBISHED',
  'CENAM Refurbished',
  'Operaciones',
  '4 libros: ingresos PX/CAC, entregado (RP/RC), irreparables y matriz resumen Recuperados/Obsoleto/Reparado/Reacondicionado por canal',
  false,
  '["Año","País","Mes","Tecnología","Recuperados CACs","Recuperados PX","Recuperados Mora","Obsoleto CACs","Obsoleto PX","Obsoleto Mora","Reparado CACs","Reparado PX","Reparado Mora","Reacondicionado CACs","Reacondicionado PX","Reacondicionado Mora"]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  requires_date_range = EXCLUDED.requires_date_range,
  columns = EXCLUDED.columns,
  is_active = true;

COMMIT;

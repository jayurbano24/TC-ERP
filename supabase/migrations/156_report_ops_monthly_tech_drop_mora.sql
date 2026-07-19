-- 156 — Quitar columna Mora del reporte OPERACIONES_MENSUAL_TECNOLOGIA
BEGIN;

UPDATE public.report_definitions
SET
  description = 'Matriz Año/País/Mes/Tecnología: ingresos CAC/PX, obsoleto, reparado y reacondicionado',
  columns = '["Año","País","Mes","Tecnología","Ingresado CACs","Ingresado PX","Obsoleto CACs","Obsoleto PX","Reparado CACs","Reparado PX","Reacondicionado CACs","Reacondicionado PX"]'::jsonb
WHERE code = 'OPERACIONES_MENSUAL_TECNOLOGIA';

COMMIT;

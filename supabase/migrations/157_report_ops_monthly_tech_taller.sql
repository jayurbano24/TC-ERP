-- 157 — Columnas Taller (ingresos CAC/PX que pasaron por taller)
BEGIN;

UPDATE public.report_definitions
SET
  description = 'Matriz Año/País/Mes/Tecnología: ingresos CAC/PX, cuántos pasaron por Taller, obsoleto, reparado y reacondicionado',
  columns = '["Año","País","Mes","Tecnología","Ingresado CACs","Ingresado PX","Taller CACs","Taller PX","Obsoleto CACs","Obsoleto PX","Reparado CACs","Reparado PX","Reacondicionado CACs","Reacondicionado PX"]'::jsonb
WHERE code = 'OPERACIONES_MENSUAL_TECNOLOGIA';

COMMIT;

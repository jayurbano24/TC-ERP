-- 158 — Alinear matriz a formato referencia (sin Taller; Reparado/Reacondicionado CACs+PX)
BEGIN;

UPDATE public.report_definitions
SET
  description = 'Matriz Año/País/Mes/Tecnología: ingresos, obsoleto, reparado y reacondicionado por origen CAC/PX',
  columns = '["Año","País","Mes","Tecnología","Ingresado CACs","Ingresado PX","Obsoleto CACs","Obsoleto PX","Reparado CACs","Reparado PX","Reacondicionado CACs","Reacondicionado PX"]'::jsonb
WHERE code = 'OPERACIONES_MENSUAL_TECNOLOGIA';

COMMIT;

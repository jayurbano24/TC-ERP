-- 259 — Columnas del reporte PREDIAGNOSTICO_EQUIPOS al formato contractual SCA (13 campos).
BEGIN;

UPDATE public.report_definitions
SET
  description = 'Formato contractual SCA: ingreso, procedencia, agencia, marca/modelo/SKU, serie, MAC, tecnología, vigencia, fecha de ingreso y prediagnóstico.',
  columns = '[
    "N.º",
    "Número de ingreso al SCA",
    "Procedencia",
    "Agencia, Central o Aliado de recuperación",
    "Marca",
    "Modelo",
    "SKU",
    "Serie",
    "MAC",
    "Tecnología",
    "Vigencia",
    "Fecha de ingreso",
    "Prediagnóstico"
  ]'::jsonb
WHERE code = 'PREDIAGNOSTICO_EQUIPOS';

COMMIT;

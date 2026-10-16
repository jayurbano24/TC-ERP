-- 260 — Pre-diagnóstico SCA: columnas separadas (dictamen/clase/diagnóstico/acción) y catálogo alineado.
BEGIN;

UPDATE public.report_definitions
SET
  description = 'Formato contractual SCA: ingreso, procedencia, agencia, marca/modelo/SKU SAP, serie, MAC, tecnología, vigencia, fecha y pre-diagnóstico en columnas separadas.',
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
    "Dictamen",
    "Clase carcasa",
    "Diagnóstico",
    "Acción",
    "Observaciones"
  ]'::jsonb
WHERE code = 'PREDIAGNOSTICO_EQUIPOS';

COMMIT;

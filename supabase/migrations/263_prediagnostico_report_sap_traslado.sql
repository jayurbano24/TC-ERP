-- 263 — Columna «Número de traslado SAP» en catálogo de reporte (metadato UI).
BEGIN;

UPDATE public.report_definitions
SET
  description = 'Incluye SKU (material G985) y número de traslado SAP cuando exista en series/validación.',
  columns = '[
    "N.º",
    "Número de ingreso al SCA",
    "Procedencia",
    "Agencia, Central o Aliado de recuperación",
    "Marca",
    "Modelo",
    "SKU",
    "Número de traslado SAP",
    "Serie",
    "MAC",
    "Tecnología",
    "Vigencia",
    "Fecha de ingreso",
    "Dictamen",
    "(catálogo pre-diagnóstico dinámico)",
    "Clase",
    "Observaciones"
  ]'::jsonb
WHERE code = 'PREDIAGNOSTICO_EQUIPOS';

COMMIT;

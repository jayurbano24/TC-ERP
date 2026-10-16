-- 262 — Reporte pre-diagnóstico: columnas de checks definidas por catálogo (no lista fija en DB).
BEGIN;

UPDATE public.report_definitions
SET
  description = 'Formato SCA: columnas fijas de ingreso + ítems activos de cat_prediagnostico_items (orden sort_order) + Clase + Observaciones. Perfil por modelo vía cat_prediagnostico_model_items.',
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
    "(catálogo pre-diagnóstico dinámico)",
    "Clase",
    "Observaciones"
  ]'::jsonb
WHERE code = 'PREDIAGNOSTICO_EQUIPOS';

COMMIT;

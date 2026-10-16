-- 252 — Reporte de equipos prediagnosticados en el portal de reportes.
BEGIN;

INSERT INTO public.report_definitions (code, name, category, description, requires_date_range, columns)
VALUES (
  'PREDIAGNOSTICO_EQUIPOS',
  'Equipos prediagnosticados',
  'CAC / Recepción',
  'Formato contractual SCA: ingreso, procedencia, agencia, marca/modelo/SKU, serie, MAC, tecnología, vigencia, fecha de ingreso y prediagnóstico.',
  true,
  '["N.º","Número de ingreso al SCA","Procedencia","Agencia, Central o Aliado de recuperación","Marca","Modelo","SKU","Serie","MAC","Tecnología","Vigencia","Fecha de ingreso","Prediagnóstico"]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  requires_date_range = EXCLUDED.requires_date_range,
  columns = EXCLUDED.columns,
  is_active = true;

COMMIT;

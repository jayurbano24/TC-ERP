-- 252 — Reporte de equipos prediagnosticados en el portal de reportes.
BEGIN;

INSERT INTO public.report_definitions (code, name, category, description, requires_date_range, columns)
VALUES (
  'PREDIAGNOSTICO_EQUIPOS',
  'Equipos prediagnosticados',
  'CAC / Recepción',
  'Detalle de prediagnóstico CAC: series, descripción SAP, diagnóstico, acción y dictamen',
  true,
  '["OS","FE","S1","S2","DESCRIPCIÓN SAP","MARCA","MODELO","TECNOLOGÍA","TRATAMIENTO","CANAL DE RECUPERACIÓN","DIAGNÓSTICO","ACCIÓN","SAP","CLASE","DICTAMEN","OBSERVACIONES"]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  requires_date_range = EXCLUDED.requires_date_range,
  columns = EXCLUDED.columns,
  is_active = true;

COMMIT;

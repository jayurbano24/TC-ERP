-- 261 — Pre-diagnóstico: matriz Si/No (Enciende, LED, …) + Clase, en lugar de Diagnóstico/Acción concatenados.
BEGIN;

UPDATE public.report_definitions
SET columns = '[
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
  "Enciende",
  "LED",
  "Puertos Ethernet",
  "Wifi",
  "Etiquetas",
  "Antena",
  "Reset",
  "Clase",
  "Observaciones"
]'::jsonb
WHERE code = 'PREDIAGNOSTICO_EQUIPOS';

COMMIT;

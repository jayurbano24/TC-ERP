-- Agregar las 3 series adicionales para equipos como el EMTA
ALTER TABLE series ADD COLUMN IF NOT EXISTS s2 text;
ALTER TABLE series ADD COLUMN IF NOT EXISTS s3 text;
ALTER TABLE series ADD COLUMN IF NOT EXISTS s4 text;

-- Agregar columnas para la validación del Excel de SAP
ALTER TABLE series ADD COLUMN IF NOT EXISTS material text;
ALTER TABLE series ADD COLUMN IF NOT EXISTS valuation text;

-- (Opcional) Podemos indexar estas columnas para acelerar las búsquedas por escáner
CREATE INDEX IF NOT EXISTS idx_series_s2 ON series(s2);
CREATE INDEX IF NOT EXISTS idx_series_s3 ON series(s3);
CREATE INDEX IF NOT EXISTS idx_series_s4 ON series(s4);

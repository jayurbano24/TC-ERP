-- migration: 022_hr_exact_timestamps.sql
-- Descripción: Añadir estructura para precisión de segundos y copias inmutables de programación de turnos.

-- 1. Añadir columnas de programación inmutable a time_logs
ALTER TABLE time_logs
ADD COLUMN IF NOT EXISTS hora_entrada_prog TIME,
ADD COLUMN IF NOT EXISTS hora_salida_prog TIME,
ADD COLUMN IF NOT EXISTS desayuno_inicio_prog TIME,
ADD COLUMN IF NOT EXISTS desayuno_fin_prog TIME,
ADD COLUMN IF NOT EXISTS almuerzo_inicio_prog TIME,
ADD COLUMN IF NOT EXISTS almuerzo_fin_prog TIME;

-- 2. Añadir columnas de cálculos exactos en segundos (para mantener separado de la estructura vieja)
ALTER TABLE time_logs
ADD COLUMN IF NOT EXISTS estado_marcacion TEXT, -- NORMAL, TARDE, TEMPRANO, EXTRA, JUSTIFICADO
ADD COLUMN IF NOT EXISTS tiempo_laborado_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiempo_efectivo_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiempo_desayuno_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiempo_almuerzo_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiempo_fuera_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tardanza_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS salida_anticipada_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS horas_extra_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiempo_tolerancia_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiempo_excedido_segundos INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS segundos_justificables INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS segundos_no_justificados INT DEFAULT 0;

-- 3. Modificaremos el tipo o la aplicación insertará nuevos strings en `evento_detectado`
-- Como `evento_detectado` actualmente es un TEXT en la app (probablemente sin ENUM estricto en BD),
-- simplemente la app insertará DESAYUNO_INICIO, DESAYUNO_FIN, ALMUERZO_INICIO, ALMUERZO_FIN, SALIDA_FINAL.

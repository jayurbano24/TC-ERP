-- Estado operativo CAC/bodega usado por classify y bandejas OS desde 029+.
-- Migración separada: PostgreSQL no permite usar un valor nuevo de ENUM en la
-- misma transacción que lo crea (mismo patrón que in_dispatch_warehouse).
ALTER TYPE public.series_status
  ADD VALUE IF NOT EXISTS 'RECEPCIONADO_BODEGA_GENERAL';

COMMENT ON TYPE public.series_status IS
  'Estado operativo de series. RECEPCIONADO_BODEGA_GENERAL = equipo clasificado en recepción, pendiente de ubicación en bodega central.';

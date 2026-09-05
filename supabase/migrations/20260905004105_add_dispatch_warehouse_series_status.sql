-- Estado físico independiente para equipos almacenados en Bodega Despacho.
-- Se agrega en una migración separada porque PostgreSQL no permite usar un
-- valor nuevo de ENUM dentro de la misma transacción que lo crea.
ALTER TYPE public.series_status
  ADD VALUE IF NOT EXISTS 'in_dispatch_warehouse';

COMMENT ON TYPE public.series_status IS
  'Estado operativo de series. in_dispatch_warehouse = equipo dentro de Bodega Despacho/Outbound, todavía no despachado.';

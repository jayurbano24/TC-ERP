-- PX Fase 4: request_id + client_duration_ms para trazabilidad forense por scan.

ALTER TABLE public.px_capture_metrics
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS client_duration_ms integer;

CREATE INDEX IF NOT EXISTS idx_px_capture_metrics_request_id
  ON public.px_capture_metrics (request_id)
  WHERE request_id IS NOT NULL;

COMMENT ON COLUMN public.px_capture_metrics.request_id IS
  'UUID generado en cliente al encolar scan; correlaciona UI → API → RPC → métrica.';

COMMENT ON COLUMN public.px_capture_metrics.client_duration_ms IS
  'Milisegundos desde encolado en cliente hasta respuesta API (incluye cola por caja).';

-- 064: Índice en series.current_box_id para acelerar el inventario de Bodega.
-- Tras la importación masiva (AppSheet) el volumen de series creció mucho y las
-- consultas "WHERE current_box_id IN (...)" / "= ..." hacían seq scan.

CREATE INDEX IF NOT EXISTS idx_series_current_box_id
  ON public.series (current_box_id)
  WHERE current_box_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

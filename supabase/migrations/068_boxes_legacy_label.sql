-- 068: Preservar etiqueta AppSheet/PX al renumerar cajas legacy → BOX-XX

ALTER TABLE public.boxes
  ADD COLUMN IF NOT EXISTS legacy_box_label text;

COMMENT ON COLUMN public.boxes.legacy_box_label IS
  'Etiqueta original (AppSheet/PX) antes de asignar correlativo BOX-XX.';

CREATE INDEX IF NOT EXISTS idx_boxes_legacy_label
  ON public.boxes (legacy_box_label)
  WHERE legacy_box_label IS NOT NULL;

NOTIFY pgrst, 'reload schema';

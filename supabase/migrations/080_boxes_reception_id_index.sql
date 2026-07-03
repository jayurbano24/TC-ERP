-- 080: Índice reception_id en boxes — acelera prep_one_box y batch finalize

CREATE INDEX IF NOT EXISTS idx_boxes_reception_id
  ON public.boxes (reception_id);

NOTIFY pgrst, 'reload schema';

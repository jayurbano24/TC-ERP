-- Agrupa varios equipos donantes bajo un mismo caso operativo de harvesting.
ALTER TABLE public.part_harvest_sessions
  ADD COLUMN IF NOT EXISTS case_id uuid DEFAULT gen_random_uuid();

UPDATE public.part_harvest_sessions
SET case_id = gen_random_uuid()
WHERE case_id IS NULL;

ALTER TABLE public.part_harvest_sessions
  ALTER COLUMN case_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN case_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_part_harvest_sessions_case_id
  ON public.part_harvest_sessions (case_id, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_part_harvest_case_donor
  ON public.part_harvest_sessions (case_id, series_id)
  WHERE series_id IS NOT NULL;

COMMENT ON COLUMN public.part_harvest_sessions.case_id IS
  'Caso operativo que agrupa una o varias series donantes; cada fila sigue representando un donante.';

NOTIFY pgrst, 'reload schema';

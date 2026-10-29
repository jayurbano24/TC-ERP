-- 286 — Origen de solicitud de piezas (Reparación in_qc | L3 in_control_warehouse)
-- Al despachar/rechazar, la OS vuelve a esta etapa en lugar de forzar in_qc.

BEGIN;

ALTER TABLE public.part_requests
  ADD COLUMN IF NOT EXISTS resume_status text;

ALTER TABLE public.part_requests
  DROP CONSTRAINT IF EXISTS part_requests_resume_status_check;

ALTER TABLE public.part_requests
  ADD CONSTRAINT part_requests_resume_status_check
  CHECK (
    resume_status IS NULL
    OR resume_status IN ('in_qc', 'in_control_warehouse')
  );

COMMENT ON COLUMN public.part_requests.resume_status IS
  'Etapa Taller a la que vuelve la OS al despachar/rechazar la solicitud (in_qc=Reparación, in_control_warehouse=L3).';

UPDATE public.part_requests
SET resume_status = 'in_qc'
WHERE resume_status IS NULL;

COMMIT;

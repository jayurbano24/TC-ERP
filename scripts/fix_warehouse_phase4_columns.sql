-- Parche Fase 4: columnas faltantes en dispatch_batches (tabla legacy preexistente)
ALTER TABLE public.dispatch_batches ADD COLUMN IF NOT EXISTS opened_by_name text;
ALTER TABLE public.dispatch_batches ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.dispatch_batches ADD COLUMN IF NOT EXISTS guide_outbound text;
ALTER TABLE public.dispatch_batches ADD COLUMN IF NOT EXISTS document_center_ref text;
ALTER TABLE public.dispatch_batches ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.dispatch_batches ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.dispatches ADD COLUMN IF NOT EXISTS dispatch_batch_id uuid REFERENCES public.dispatch_batches(id);
ALTER TABLE public.dispatches ADD COLUMN IF NOT EXISTS box_id uuid REFERENCES public.boxes(id);
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS last_dispatch_batch_id uuid REFERENCES public.dispatch_batches(id);

NOTIFY pgrst, 'reload schema';

-- Catálogo technologies + FK en models (referenciado desde 015_taller_kpi_goals y toda la app).
-- No existía en migraciones versionadas; bases productivas lo tenían desde SQL manual.

CREATE TABLE IF NOT EXISTS public.technologies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  series_count integer NOT NULL DEFAULT 1,
  digits_per_series integer[] NOT NULL DEFAULT '{12}'::integer[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_technologies_name_normalized
  ON public.technologies (upper(trim(name)));

ALTER TABLE public.models
  ADD COLUMN IF NOT EXISTS technology_id uuid REFERENCES public.technologies(id) ON DELETE SET NULL;

ALTER TABLE public.models
  ADD COLUMN IF NOT EXISTS series_count integer;

ALTER TABLE public.models
  ADD COLUMN IF NOT EXISTS digits_per_series integer[];

ALTER TABLE public.technologies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS technologies_read ON public.technologies;
CREATE POLICY technologies_read ON public.technologies
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS technologies_write ON public.technologies;
CREATE POLICY technologies_write ON public.technologies
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

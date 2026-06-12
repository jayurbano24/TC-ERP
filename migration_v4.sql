ALTER TABLE public.time_logs 
  ADD COLUMN IF NOT EXISTS razon_tardanza TEXT;

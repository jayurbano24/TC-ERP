ALTER TABLE public.time_logs 
  ADD COLUMN IF NOT EXISTS minutos_extra INT DEFAULT 0;

ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS bono_metas NUMERIC(10,2) DEFAULT 0.00;

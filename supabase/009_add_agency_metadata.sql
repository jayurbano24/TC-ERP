-- TC-ERP Multimedia - Add metadata columns to agencies table
-- Run this script in Supabase SQL editor as project owner.

ALTER TABLE public.agencies 
ADD COLUMN IF NOT EXISTS manager TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT;

-- Update existing records if needed (optional)
-- UPDATE public.agencies SET manager = 'Encargado Pendiente' WHERE manager IS NULL;

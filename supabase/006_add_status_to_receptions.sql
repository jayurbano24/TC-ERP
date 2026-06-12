-- Add status to receptions table to match UI requirements
alter table public.receptions add column if not exists status text default 'RECIBIDO';

-- Create an index for faster lookups
create index if not exists idx_receptions_status on public.receptions(status);

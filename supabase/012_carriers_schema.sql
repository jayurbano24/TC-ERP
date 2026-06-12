-- Crear tabla de Transporte Logístico (logistics_carriers)
create table if not exists public.logistics_carriers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- Habilitar RLS
alter table public.logistics_carriers enable row level security;

-- Políticas de lectura (Todos pueden leer)
drop policy if exists logistics_carriers_read on public.logistics_carriers;
create policy logistics_carriers_read on public.logistics_carriers
  for select using (true);

-- Políticas de escritura (Usuarios autenticados pueden modificar)
drop policy if exists logistics_carriers_write on public.logistics_carriers;
create policy logistics_carriers_write on public.logistics_carriers
  for all using (auth.uid() is not null);

-- Insertar datos iniciales
insert into public.logistics_carriers (code, name) values
  ('CARGO_EXPRESS', 'Cargo Express'),
  ('GUATEX', 'Guatex'),
  ('DHL_EXPRESS', 'DHL Express'),
  ('FEDEX', 'FedEx'),
  ('TRANSEXPRESS', 'Transexpress'),
  ('DISTRIB', 'Distrib'),
  ('MARCELINO', 'Marcelino'),
  ('OTRO', 'Otro')
on conflict (code) do nothing;

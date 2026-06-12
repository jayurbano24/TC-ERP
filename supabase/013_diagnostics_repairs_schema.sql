-- 013_diagnostics_repairs_schema.sql

create table if not exists public.cat_repairs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cat_diagnostics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cat_diagnostic_repairs (
  diagnostic_id uuid references public.cat_diagnostics(id) on delete cascade,
  repair_id uuid references public.cat_repairs(id) on delete cascade,
  primary key (diagnostic_id, repair_id)
);

-- Update series to track selected diagnostics
alter table public.series
add column if not exists current_diagnostics uuid[] default '{}';

-- Optionally seed some initial data
insert into public.cat_repairs (id, name) values 
  ('11111111-1111-1111-1111-111111111111', 'CAMBIO DE FUENTE'),
  ('22222222-2222-2222-2222-222222222222', 'RESET DE FABRICA'),
  ('33333333-3333-3333-3333-333333333333', 'REPOSICION DE ANTENA'),
  ('44444444-4444-4444-4444-444444444444', 'LIMPIEZA DE PUERTOS')
on conflict do nothing;

insert into public.cat_diagnostics (id, name) values 
  ('55555555-5555-5555-5555-555555555555', 'NO ENCIENDE'),
  ('66666666-6666-6666-6666-666666666666', 'SIN SEÑAL WIFI'),
  ('77777777-7777-7777-7777-777777777777', 'PUERTOS LAN DAÑADOS')
on conflict do nothing;

insert into public.cat_diagnostic_repairs (diagnostic_id, repair_id) values 
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111'),
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222'),
  ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333'),
  ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444'),
  ('77777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444')
on conflict do nothing;

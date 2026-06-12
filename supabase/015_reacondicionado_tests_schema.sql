drop table if exists public.cat_reacondicionado_tests cascade;

create table public.cat_reacondicionado_tests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  technology_ids uuid[] default '{}',
  model_ids uuid[] default '{}',
  created_at timestamptz not null default now()
);

-- Habilitar RLS
alter table public.cat_reacondicionado_tests enable row level security;

-- Políticas de lectura (pública para usuarios autenticados)
create policy "Enable read access for all users"
  on public.cat_reacondicionado_tests for select
  using (true);

-- Políticas de inserción, actualización, eliminación (solo roles permitidos, pero por ahora como las otras tablas, abiertas a todos)
create policy "Enable insert for authenticated users"
  on public.cat_reacondicionado_tests for insert
  with check (true);

create policy "Enable update for authenticated users"
  on public.cat_reacondicionado_tests for update
  using (true);

create policy "Enable delete for authenticated users"
  on public.cat_reacondicionado_tests for delete
  using (true);

-- Insertar opciones por defecto para que estén disponibles inmediatamente
insert into public.cat_reacondicionado_tests (name) values
  ('Cosmética'),
  ('Limpieza de puerto LAN'),
  ('RF'),
  ('SPC Fibra'),
  ('Lijado'),
  ('Sopleteo Internos'),
  ('Sopleteo Externo');

-- FORZAR RECARGA DE CACHÉ DE ESQUEMA EN SUPABASE
NOTIFY pgrst, 'reload schema';

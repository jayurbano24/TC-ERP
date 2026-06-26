-- =============================================================================
-- 063 — Catálogo dinámico de Razones de Devolución
-- =============================================================================
-- Permite administrar desde Configuración los motivos por los que un equipo se
-- envía a devolución (antes era una lista fija en el front: RETURN_REASONS).
-- Mismo patrón que px_providers / logistics_carriers.
-- Idempotente.
-- =============================================================================

create table if not exists public.return_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.return_reasons enable row level security;

drop policy if exists return_reasons_read_auth on public.return_reasons;
create policy return_reasons_read_auth on public.return_reasons
  for select using (auth.uid() is not null);

drop policy if exists return_reasons_write_ops on public.return_reasons;
create policy return_reasons_write_ops on public.return_reasons
  for all using (
    public.app_has_role('admin') or public.app_has_role('supervisor')
  )
  with check (
    public.app_has_role('admin') or public.app_has_role('supervisor')
  );

-- Seed con los motivos que estaban fijos en el front
insert into public.return_reasons (name) values
  ('Garantía - No enciende'),
  ('Garantía - Señal Inestable'),
  ('Cambio de Tecnología'),
  ('Error de Despacho'),
  ('Pedido Duplicado'),
  ('Equipo Obsoleto'),
  ('Daño Cosmético / Golpeado')
on conflict (name) do nothing;

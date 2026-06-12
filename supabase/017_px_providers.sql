-- TC-ERP Multimedia - Initial schema for PX Providers
-- NOTE: app_has_role must be SECURITY DEFINER to avoid RLS circular dependency.
-- Without it, app_has_role can't read user_roles (which itself uses app_has_role),
-- causing the function to always return false. Fix applied via SQL Editor:

create table if not exists public.px_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.px_providers enable row level security;

drop policy if exists px_providers_read_auth on public.px_providers;
create policy px_providers_read_auth on public.px_providers
  for select using (auth.uid() is not null);

drop policy if exists px_providers_write_ops on public.px_providers;
create policy px_providers_write_ops on public.px_providers
  for all using (
    public.app_has_role('admin') or public.app_has_role('supervisor')
  )
  with check (
    public.app_has_role('admin') or public.app_has_role('supervisor')
  );

-- Seed defaults
insert into public.px_providers (code, name) values
  ('LGB', 'LGB'),
  ('GAUSS', 'GAUSS'),
  ('RELESA', 'RELESA'),
  ('REDESIS', 'REDESIS')
on conflict (code) do nothing;

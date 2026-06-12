-- 016_user_kpis.sql

create table if not exists public.user_kpi_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_value integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create trigger trg_user_kpi_targets_updated_at
before update on public.user_kpi_targets
for each row execute function public.set_updated_at();

alter table public.user_kpi_targets enable row level security;

drop policy if exists kpi_targets_read_auth on public.user_kpi_targets;
create policy kpi_targets_read_auth on public.user_kpi_targets
  for select using (auth.uid() is not null);

drop policy if exists kpi_targets_write_admin on public.user_kpi_targets;
create policy kpi_targets_write_admin on public.user_kpi_targets
  for all using (
    public.app_has_role('admin') or public.app_has_role('supervisor') or public.app_has_role('gerencia')
  )
  with check (
    public.app_has_role('admin') or public.app_has_role('supervisor') or public.app_has_role('gerencia')
  );

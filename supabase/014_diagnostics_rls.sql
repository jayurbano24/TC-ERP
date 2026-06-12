-- 014_diagnostics_rls.sql

-- Habilitar RLS en las nuevas tablas
alter table public.cat_repairs enable row level security;
alter table public.cat_diagnostics enable row level security;
alter table public.cat_diagnostic_repairs enable row level security;

-- Políticas para cat_repairs
drop policy if exists cat_repairs_read on public.cat_repairs;
create policy cat_repairs_read on public.cat_repairs
  for select using (auth.uid() is not null);

drop policy if exists cat_repairs_write on public.cat_repairs;
create policy cat_repairs_write on public.cat_repairs
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Políticas para cat_diagnostics
drop policy if exists cat_diagnostics_read on public.cat_diagnostics;
create policy cat_diagnostics_read on public.cat_diagnostics
  for select using (auth.uid() is not null);

drop policy if exists cat_diagnostics_write on public.cat_diagnostics;
create policy cat_diagnostics_write on public.cat_diagnostics
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Políticas para cat_diagnostic_repairs
drop policy if exists cat_diagnostic_repairs_read on public.cat_diagnostic_repairs;
create policy cat_diagnostic_repairs_read on public.cat_diagnostic_repairs
  for select using (auth.uid() is not null);

drop policy if exists cat_diagnostic_repairs_write on public.cat_diagnostic_repairs;
create policy cat_diagnostic_repairs_write on public.cat_diagnostic_repairs
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);

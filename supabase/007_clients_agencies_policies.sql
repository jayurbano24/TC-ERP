-- TC-ERP Multimedia - Fix permissions for clients and agencies tables
-- These tables were created without GRANT statements, blocking authenticated users.
-- Run in Supabase SQL editor as project owner.

-- =========================
-- GRANT base permissions
-- =========================
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.agencies to authenticated;

-- =========================
-- Enable RLS on master data tables
-- =========================
alter table public.clients enable row level security;
alter table public.agencies enable row level security;

-- =========================
-- Clients policies
-- =========================
drop policy if exists clients_read_auth on public.clients;
create policy clients_read_auth on public.clients
  for select using (auth.uid() is not null);

drop policy if exists clients_write_admin on public.clients;
create policy clients_write_admin on public.clients
  for all using (public.app_has_role('admin') or public.app_has_role('supervisor'))
  with check (public.app_has_role('admin') or public.app_has_role('supervisor'));

-- =========================
-- Agencies policies
-- =========================
drop policy if exists agencies_read_auth on public.agencies;
create policy agencies_read_auth on public.agencies
  for select using (auth.uid() is not null);

drop policy if exists agencies_write_admin on public.agencies;
create policy agencies_write_admin on public.agencies
  for all using (public.app_has_role('admin') or public.app_has_role('supervisor'))
  with check (public.app_has_role('admin') or public.app_has_role('supervisor'));

-- =========================
-- Ensure TC-DEFAULT client exists (idempotent)
-- =========================
insert into public.clients (code, name)
values ('TC-DEFAULT', 'Tech Corps Default Client')
on conflict (code) do nothing;

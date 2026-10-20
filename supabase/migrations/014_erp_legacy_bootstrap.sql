-- =============================================================================
-- 014 — Bootstrap legacy ERP (001–019 fuera de migrations/)
-- Generado por scripts/assemble-erp-bootstrap-migration.mjs — no editar a mano.
-- Idempotente (IF NOT EXISTS / duplicate_object). Compatible con bases que ya
-- ejecutaron estos scripts en el SQL Editor.
-- =============================================================================


-- >>> BEGIN 001_initial_schema.sql
-- TC-ERP Multimedia - Initial schema for Supabase
-- Run this script in Supabase SQL editor as project owner.

create extension if not exists pgcrypto;

-- =========================
-- Types
-- =========================
-- Los tipos se crean dentro de bloques DO idempotentes: Postgres no soporta
-- `create type if not exists`, así que se captura `duplicate_object` para que el
-- script pueda re-ejecutarse sin fallar con "type ... already exists" (42710).
do $$ begin
  create type public.app_role as enum (
    'admin',
    'supervisor',
    'receptor_cac',
    'receptor_px',
    'bodega',
    'tecnico',
    'qc',
    'gerencia'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reception_source as enum ('cac', 'px');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.box_status as enum ('open', 'closed', 'blocked');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.series_status as enum (
    'received',
    'in_validation',
    'in_central_warehouse',
    'in_control_warehouse',
    'in_workshop',
    'in_qc',
    'ready_to_dispatch',
    'dispatched',
    'returned',
    'obsolete',
    'irreparable'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.service_order_status as enum ('open', 'in_progress', 'qc', 'closed', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.dispatch_type as enum ('massive', 'individual', 'master_box', 'single_box');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.finding_type as enum ('qty_mismatch', 'reprinted_serial', 'invalid_serial', 'equipment_issue', 'other');
exception when duplicate_object then null;
end $$;

-- =========================
-- Core identity and RBAC
-- =========================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- =========================
-- Master data
-- =========================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (client_id, code)
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null
);

create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete restrict,
  code text not null,
  name text not null,
  unique (brand_id, code)
);

-- =========================
-- Reception, boxes, series
-- =========================
create table if not exists public.receptions (
  id uuid primary key default gen_random_uuid(),
  source public.reception_source not null,
  guide_number text not null,
  sap_document text,
  carrier text,
  received_by uuid references public.profiles(id),
  reception_time timestamptz not null default now(),
  expected_units integer,
  received_units integer,
  evidence_url text,
  notes text,
  created_at timestamptz not null default now(),
  unique (source, guide_number)
);

create table if not exists public.boxes (
  id uuid primary key default gen_random_uuid(),
  reception_id uuid not null references public.receptions(id) on delete cascade,
  box_code text not null,
  brand_id uuid references public.brands(id),
  model_id uuid references public.models(id),
  status public.box_status not null default 'open',
  rack_location text,
  capacity integer,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (reception_id, box_code)
);

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  serial_number text not null unique,
  brand_id uuid references public.brands(id),
  model_id uuid references public.models(id),
  current_status public.series_status not null default 'received',
  current_box_id uuid references public.boxes(id),
  current_reception_id uuid references public.receptions(id),
  ingress_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.box_series (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.boxes(id) on delete cascade,
  series_id uuid not null references public.series(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (box_id, series_id),
  unique (series_id)
);

create table if not exists public.reception_findings (
  id uuid primary key default gen_random_uuid(),
  reception_id uuid not null references public.receptions(id) on delete cascade,
  series_id uuid references public.series(id),
  finding public.finding_type not null,
  detail text not null,
  assigned_supervisor uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- =========================
-- Service orders and workshop
-- =========================
create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete restrict,
  status public.service_order_status not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  rejection_reason text,
  notes text
);

-- Garantiza las columnas en tablas preexistentes: `create table if not exists`
-- no modifica una tabla que ya existe, por lo que una versión vieja de
-- service_orders podría no tener series_id/closed_at y el índice parcial
-- fallaría (42703). Se aseguran ambas ANTES de crear el índice.
alter table public.service_orders add column if not exists series_id uuid;
alter table public.service_orders add column if not exists closed_at timestamptz;

-- Rule: do not allow duplicated series in open service flow.
create unique index if not exists uq_service_orders_open_per_series
  on public.service_orders(series_id)
  where closed_at is null;

create table if not exists public.workshop_jobs (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  stage text not null,
  technician_id uuid references public.profiles(id),
  started_at timestamptz,
  ended_at timestamptz,
  result text,
  created_at timestamptz not null default now()
);

create table if not exists public.qc_checks (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  qc_user_id uuid references public.profiles(id),
  passed boolean not null,
  cosmetic_ok boolean,
  power_cycle_ok boolean,
  stress_test_ok boolean,
  notes text,
  created_at timestamptz not null default now()
);

-- =========================
-- Warehouse and dispatch
-- =========================
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete restrict,
  movement_type text not null,
  source_location text,
  target_location text,
  source_box_id uuid references public.boxes(id),
  target_box_id uuid references public.boxes(id),
  moved_by uuid references public.profiles(id),
  moved_at timestamptz not null default now(),
  notes text
);

create table if not exists public.dispatches (
  id uuid primary key default gen_random_uuid(),
  dispatch_type public.dispatch_type not null,
  guide_number text,
  dispatched_by uuid references public.profiles(id),
  dispatched_at timestamptz not null default now(),
  notes text
);

create table if not exists public.dispatch_items (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatches(id) on delete cascade,
  series_id uuid not null references public.series(id) on delete restrict,
  box_id uuid references public.boxes(id),
  created_at timestamptz not null default now(),
  unique (dispatch_id, series_id)
);

-- =========================
-- Audit and helpers
-- =========================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id text not null,
  action text not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  payload jsonb
);

-- =========================
-- Reconciliación de columnas (idempotente)
-- =========================
-- `create table if not exists` NO modifica tablas que ya existen, por lo que una
-- base con una versión antigua del esquema puede tener columnas faltantes y
-- provocar errores 42703. Estos `add column if not exists` añaden cualquier
-- columna ausente sin tocar las existentes. Se omiten `not null`/FK aquí para no
-- fallar sobre tablas con datos; las bases nuevas ya obtienen esas restricciones
-- desde el `create table` de arriba.

-- profiles
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists is_active boolean default true;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

-- user_roles
alter table public.user_roles add column if not exists user_id uuid;
alter table public.user_roles add column if not exists role public.app_role;
alter table public.user_roles add column if not exists created_at timestamptz default now();

-- clients
alter table public.clients add column if not exists code text;
alter table public.clients add column if not exists name text;
alter table public.clients add column if not exists created_at timestamptz default now();

-- agencies
alter table public.agencies add column if not exists client_id uuid;
alter table public.agencies add column if not exists code text;
alter table public.agencies add column if not exists name text;
alter table public.agencies add column if not exists created_at timestamptz default now();

-- brands
alter table public.brands add column if not exists code text;
alter table public.brands add column if not exists name text;

-- models
alter table public.models add column if not exists brand_id uuid;
alter table public.models add column if not exists code text;
alter table public.models add column if not exists name text;

-- receptions
alter table public.receptions add column if not exists source public.reception_source;
alter table public.receptions add column if not exists guide_number text;
alter table public.receptions add column if not exists sap_document text;
alter table public.receptions add column if not exists carrier text;
alter table public.receptions add column if not exists received_by uuid;
alter table public.receptions add column if not exists reception_time timestamptz default now();
alter table public.receptions add column if not exists expected_units integer;
alter table public.receptions add column if not exists received_units integer;
alter table public.receptions add column if not exists evidence_url text;
alter table public.receptions add column if not exists notes text;
alter table public.receptions add column if not exists created_at timestamptz default now();

-- boxes
alter table public.boxes add column if not exists reception_id uuid;
alter table public.boxes add column if not exists box_code text;
alter table public.boxes add column if not exists brand_id uuid;
alter table public.boxes add column if not exists model_id uuid;
alter table public.boxes add column if not exists status public.box_status default 'open';
alter table public.boxes add column if not exists rack_location text;
alter table public.boxes add column if not exists capacity integer;
alter table public.boxes add column if not exists created_at timestamptz default now();
alter table public.boxes add column if not exists closed_at timestamptz;

-- series
alter table public.series add column if not exists serial_number text;
alter table public.series add column if not exists brand_id uuid;
alter table public.series add column if not exists model_id uuid;
alter table public.series add column if not exists current_status public.series_status default 'received';
alter table public.series add column if not exists current_box_id uuid;
alter table public.series add column if not exists current_reception_id uuid;
alter table public.series add column if not exists ingress_count integer default 1;
alter table public.series add column if not exists created_at timestamptz default now();
alter table public.series add column if not exists updated_at timestamptz default now();

-- box_series
alter table public.box_series add column if not exists box_id uuid;
alter table public.box_series add column if not exists series_id uuid;
alter table public.box_series add column if not exists created_at timestamptz default now();

-- reception_findings
alter table public.reception_findings add column if not exists reception_id uuid;
alter table public.reception_findings add column if not exists series_id uuid;
alter table public.reception_findings add column if not exists finding public.finding_type;
alter table public.reception_findings add column if not exists detail text;
alter table public.reception_findings add column if not exists assigned_supervisor uuid;
alter table public.reception_findings add column if not exists resolved_at timestamptz;
alter table public.reception_findings add column if not exists created_at timestamptz default now();

-- service_orders
alter table public.service_orders add column if not exists series_id uuid;
alter table public.service_orders add column if not exists status public.service_order_status default 'open';
alter table public.service_orders add column if not exists opened_at timestamptz default now();
alter table public.service_orders add column if not exists closed_at timestamptz;
alter table public.service_orders add column if not exists opened_by uuid;
alter table public.service_orders add column if not exists assigned_to uuid;
alter table public.service_orders add column if not exists rejection_reason text;
alter table public.service_orders add column if not exists notes text;

-- workshop_jobs
alter table public.workshop_jobs add column if not exists service_order_id uuid;
alter table public.workshop_jobs add column if not exists stage text;
alter table public.workshop_jobs add column if not exists technician_id uuid;
alter table public.workshop_jobs add column if not exists started_at timestamptz;
alter table public.workshop_jobs add column if not exists ended_at timestamptz;
alter table public.workshop_jobs add column if not exists result text;
alter table public.workshop_jobs add column if not exists created_at timestamptz default now();

-- qc_checks
alter table public.qc_checks add column if not exists service_order_id uuid;
alter table public.qc_checks add column if not exists qc_user_id uuid;
alter table public.qc_checks add column if not exists passed boolean;
alter table public.qc_checks add column if not exists cosmetic_ok boolean;
alter table public.qc_checks add column if not exists power_cycle_ok boolean;
alter table public.qc_checks add column if not exists stress_test_ok boolean;
alter table public.qc_checks add column if not exists notes text;
alter table public.qc_checks add column if not exists created_at timestamptz default now();

-- inventory_movements
alter table public.inventory_movements add column if not exists series_id uuid;
alter table public.inventory_movements add column if not exists movement_type text;
alter table public.inventory_movements add column if not exists source_location text;
alter table public.inventory_movements add column if not exists target_location text;
alter table public.inventory_movements add column if not exists source_box_id uuid;
alter table public.inventory_movements add column if not exists target_box_id uuid;
alter table public.inventory_movements add column if not exists moved_by uuid;
alter table public.inventory_movements add column if not exists moved_at timestamptz default now();
alter table public.inventory_movements add column if not exists notes text;

-- dispatches
alter table public.dispatches add column if not exists dispatch_type public.dispatch_type;
alter table public.dispatches add column if not exists guide_number text;
alter table public.dispatches add column if not exists dispatched_by uuid;
alter table public.dispatches add column if not exists dispatched_at timestamptz default now();
alter table public.dispatches add column if not exists notes text;

-- dispatch_items
alter table public.dispatch_items add column if not exists dispatch_id uuid;
alter table public.dispatch_items add column if not exists series_id uuid;
alter table public.dispatch_items add column if not exists box_id uuid;
alter table public.dispatch_items add column if not exists created_at timestamptz default now();

-- audit_logs
alter table public.audit_logs add column if not exists table_name text;
alter table public.audit_logs add column if not exists record_id text;
alter table public.audit_logs add column if not exists action text;
alter table public.audit_logs add column if not exists changed_by uuid;
alter table public.audit_logs add column if not exists changed_at timestamptz default now();
alter table public.audit_logs add column if not exists payload jsonb;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_series_updated_at on public.series;
create trigger trg_series_updated_at
before update on public.series
for each row execute function public.set_updated_at();

-- SECURITY DEFINER es OBLIGATORIO: esta función se usa dentro de políticas RLS
-- (incluida la política FOR ALL de user_roles, que aplica también a SELECT). Si
-- corriera como SECURITY INVOKER, su `select ... from user_roles` volvería a
-- evaluar las políticas de user_roles -> que llaman a app_has_role() -> recursión
-- infinita => "stack depth limit exceeded". Con SECURITY DEFINER la consulta
-- interna NO re-evalúa RLS y se rompe el ciclo.
create or replace function public.app_has_role(target_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = target_role
  );
$$;

-- =========================
-- RLS baseline
-- =========================
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.receptions enable row level security;
alter table public.boxes enable row level security;
alter table public.series enable row level security;
alter table public.box_series enable row level security;
alter table public.reception_findings enable row level security;
alter table public.service_orders enable row level security;
alter table public.workshop_jobs enable row level security;
alter table public.qc_checks enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.dispatches enable row level security;
alter table public.dispatch_items enable row level security;

-- Basic policies, can be hardened later per module.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.app_has_role('admin'));

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid() or public.app_has_role('admin'))
  with check (id = auth.uid() or public.app_has_role('admin'));

-- FIX: user_roles read policy must NOT call app_has_role() to avoid circular RLS.
-- A user always reads their own roles; this is what app_has_role() needs to work.
drop policy if exists user_roles_admin_read on public.user_roles;
drop policy if exists user_roles_self_read on public.user_roles;
create policy user_roles_self_read on public.user_roles
  for select using (user_id = auth.uid());

drop policy if exists user_roles_admin_write on public.user_roles;
create policy user_roles_admin_write on public.user_roles
  for all using (public.app_has_role('admin'))
  with check (public.app_has_role('admin'));

-- Operational tables: read for authenticated users, write for operational roles.
drop policy if exists receptions_read_auth on public.receptions;
create policy receptions_read_auth on public.receptions
  for select using (auth.uid() is not null);
drop policy if exists receptions_write_ops on public.receptions;
create policy receptions_write_ops on public.receptions
  for all using (
    public.app_has_role('admin') or public.app_has_role('supervisor') or
    public.app_has_role('receptor_cac') or public.app_has_role('receptor_px')
  )
  with check (
    public.app_has_role('admin') or public.app_has_role('supervisor') or
    public.app_has_role('receptor_cac') or public.app_has_role('receptor_px')
  );

drop policy if exists boxes_read_auth on public.boxes;
create policy boxes_read_auth on public.boxes
  for select using (auth.uid() is not null);
drop policy if exists boxes_write_ops on public.boxes;
create policy boxes_write_ops on public.boxes
  for all using (
    public.app_has_role('admin') or public.app_has_role('supervisor') or
    public.app_has_role('bodega') or public.app_has_role('receptor_cac') or public.app_has_role('receptor_px')
  )
  with check (
    public.app_has_role('admin') or public.app_has_role('supervisor') or
    public.app_has_role('bodega') or public.app_has_role('receptor_cac') or public.app_has_role('receptor_px')
  );

drop policy if exists series_read_auth on public.series;
create policy series_read_auth on public.series
  for select using (auth.uid() is not null);
drop policy if exists series_write_ops on public.series;
create policy series_write_ops on public.series
  for all using (
    public.app_has_role('admin') or public.app_has_role('supervisor') or
    public.app_has_role('receptor_cac') or public.app_has_role('receptor_px') or public.app_has_role('bodega')
  )
  with check (
    public.app_has_role('admin') or public.app_has_role('supervisor') or
    public.app_has_role('receptor_cac') or public.app_has_role('receptor_px') or public.app_has_role('bodega')
  );

drop policy if exists service_orders_read_auth on public.service_orders;
create policy service_orders_read_auth on public.service_orders
  for select using (auth.uid() is not null);
drop policy if exists service_orders_write_ops on public.service_orders;
create policy service_orders_write_ops on public.service_orders
  for all using (
    public.app_has_role('admin') or public.app_has_role('supervisor') or
    public.app_has_role('tecnico') or public.app_has_role('qc')
  )
  with check (
    public.app_has_role('admin') or public.app_has_role('supervisor') or
    public.app_has_role('tecnico') or public.app_has_role('qc')
  );

drop policy if exists workshop_jobs_read_auth on public.workshop_jobs;
create policy workshop_jobs_read_auth on public.workshop_jobs
  for select using (auth.uid() is not null);
drop policy if exists workshop_jobs_write_ops on public.workshop_jobs;
create policy workshop_jobs_write_ops on public.workshop_jobs
  for all using (
    public.app_has_role('admin') or public.app_has_role('supervisor') or public.app_has_role('tecnico')
  )
  with check (
    public.app_has_role('admin') or public.app_has_role('supervisor') or public.app_has_role('tecnico')
  );

drop policy if exists qc_checks_read_auth on public.qc_checks;
create policy qc_checks_read_auth on public.qc_checks
  for select using (auth.uid() is not null);
drop policy if exists qc_checks_write_ops on public.qc_checks;
create policy qc_checks_write_ops on public.qc_checks
  for all using (
    public.app_has_role('admin') or public.app_has_role('supervisor') or public.app_has_role('qc')
  )
  with check (
    public.app_has_role('admin') or public.app_has_role('supervisor') or public.app_has_role('qc')
  );

drop policy if exists inventory_movements_read_auth on public.inventory_movements;
create policy inventory_movements_read_auth on public.inventory_movements
  for select using (auth.uid() is not null);
drop policy if exists inventory_movements_write_ops on public.inventory_movements;
create policy inventory_movements_write_ops on public.inventory_movements
  for all using (
    public.app_has_role('admin') or public.app_has_role('supervisor') or public.app_has_role('bodega')
  )
  with check (
    public.app_has_role('admin') or public.app_has_role('supervisor') or public.app_has_role('bodega')
  );

drop policy if exists dispatches_read_auth on public.dispatches;
create policy dispatches_read_auth on public.dispatches
  for select using (auth.uid() is not null);
drop policy if exists dispatches_write_ops on public.dispatches;
create policy dispatches_write_ops on public.dispatches
  for all using (
    public.app_has_role('admin') or public.app_has_role('supervisor') or public.app_has_role('bodega')
  )
  with check (
    public.app_has_role('admin') or public.app_has_role('supervisor') or public.app_has_role('bodega')
  );

drop policy if exists dispatch_items_read_auth on public.dispatch_items;
create policy dispatch_items_read_auth on public.dispatch_items
  for select using (auth.uid() is not null);
drop policy if exists dispatch_items_write_ops on public.dispatch_items;
create policy dispatch_items_write_ops on public.dispatch_items
  for all using (
    public.app_has_role('admin') or public.app_has_role('supervisor') or public.app_has_role('bodega')
  )
  with check (
    public.app_has_role('admin') or public.app_has_role('supervisor') or public.app_has_role('bodega')
  );

-- <<< END 001_initial_schema.sql

-- >>> BEGIN bootstrap_fragments/002_service_orders_shape_bridge.sql
-- 001 define service_orders ligado a series_id; 010 define el modelo operativo (main_serial).
-- Instalación limpia: quitar el cascarón legacy vacío para que 010 cree la tabla correcta.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_orders' AND column_name = 'series_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_orders' AND column_name = 'main_serial'
  ) THEN
    DROP TABLE IF EXISTS public.qc_checks CASCADE;
    DROP TABLE IF EXISTS public.workshop_jobs CASCADE;
    DROP TABLE IF EXISTS public.service_orders CASCADE;
  END IF;
END $$;

-- <<< END bootstrap_fragments/002_service_orders_shape_bridge.sql

-- >>> BEGIN 006_add_status_to_receptions.sql
-- Add status to receptions table to match UI requirements
alter table public.receptions add column if not exists status text default 'RECIBIDO';

-- Create an index for faster lookups
create index if not exists idx_receptions_status on public.receptions(status);

-- <<< END 006_add_status_to_receptions.sql

-- >>> BEGIN 007_clients_agencies_policies.sql
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

-- <<< END 007_clients_agencies_policies.sql

-- >>> BEGIN 008_fix_clients_seed_and_receptor_access.sql
-- TC-ERP Multimedia - Fix clients seed & receptor access
-- Run in Supabase SQL editor as project owner (uses service_role privileges).
-- Resolves: "No se pudo obtener el client_id de referencia"

-- =========================================================
-- 1. Asegurar que el cliente base TC-DEFAULT existe
--    Ejecutado como service_role => omite RLS sin problema.
-- =========================================================
insert into public.clients (code, name)
values ('TC-DEFAULT', 'Tech Corps Default Client')
on conflict (code) do nothing;

-- =========================================================
-- 2. Ampliar política de ESCRITURA en clients:
--    Actualmente sólo admin/supervisor pueden insertar.
--    Pero ensureClientId() corre en el browser con el JWT
--    del usuario logueado → necesita poder leer al menos.
--    La lectura ya está cubierta por clients_read_auth.
--    Para el INSERT de fallback, usamos service_role vía
--    la semilla SQL (arriba). No se necesita cambiar RLS.
-- =========================================================

-- =========================================================
-- 3. Permitir que receptor_cac y receptor_px puedan
--    leer y escribir agencias (necesario para backoffice).
-- =========================================================
drop policy if exists agencies_write_admin on public.agencies;
create policy agencies_write_admin on public.agencies
  for all using (
    public.app_has_role('admin') or public.app_has_role('supervisor') or
    public.app_has_role('receptor_cac') or public.app_has_role('receptor_px')
  )
  with check (
    public.app_has_role('admin') or public.app_has_role('supervisor') or
    public.app_has_role('receptor_cac') or public.app_has_role('receptor_px')
  );

-- =========================================================
-- 4. Verificación final
-- =========================================================
select id, code, name from public.clients where code = 'TC-DEFAULT';

-- <<< END 008_fix_clients_seed_and_receptor_access.sql

-- >>> BEGIN 009_add_agency_metadata.sql
-- TC-ERP Multimedia - Add metadata columns to agencies table
-- Run this script in Supabase SQL editor as project owner.

ALTER TABLE public.agencies 
ADD COLUMN IF NOT EXISTS manager TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT;

-- Update existing records if needed (optional)
-- UPDATE public.agencies SET manager = 'Encargado Pendiente' WHERE manager IS NULL;

-- <<< END 009_add_agency_metadata.sql

-- >>> BEGIN 010_create_service_orders.sql
-- Create service_orders table to track units and their re-entries
CREATE TABLE IF NOT EXISTS public.service_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_number SERIAL,
    os_label TEXT GENERATED ALWAYS AS ('TC-' || LPAD(os_number::text, 5, '0')) STORED,
    reception_id UUID REFERENCES public.receptions(id) ON DELETE CASCADE,
    model_id UUID REFERENCES public.models(id),
    brand_id UUID REFERENCES public.brands(id),
    main_serial TEXT NOT NULL, -- S1 or the primary identifier
    reentry_count INTEGER DEFAULT 1,
    status TEXT DEFAULT 'INGRESADO',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by serial to calculate re-entries
CREATE INDEX IF NOT EXISTS idx_service_orders_main_serial ON public.service_orders(main_serial);

-- Add OS reference to series table if needed, or link series to service_orders
ALTER TABLE public.series ADD COLUMN IF NOT EXISTS service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL;

-- <<< END 010_create_service_orders.sql

-- >>> BEGIN 011_audit_logs_policies.sql
-- Habilitar RLS en audit_logs por seguridad
alter table public.audit_logs enable row level security;

-- Permitir a usuarios autenticados leer los historiales
drop policy if exists audit_logs_read_auth on public.audit_logs;
create policy audit_logs_read_auth on public.audit_logs
  for select using (auth.uid() is not null);

-- Permitir a usuarios autenticados insertar logs
drop policy if exists audit_logs_insert_auth on public.audit_logs;
create policy audit_logs_insert_auth on public.audit_logs
  for insert with check (auth.uid() is not null);

-- <<< END 011_audit_logs_policies.sql

-- >>> BEGIN 012_carriers_schema.sql
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

-- <<< END 012_carriers_schema.sql

-- >>> BEGIN 013_diagnostics_repairs_schema.sql
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

-- <<< END 013_diagnostics_repairs_schema.sql

-- >>> BEGIN 014_diagnostics_rls.sql
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

-- <<< END 014_diagnostics_rls.sql

-- >>> BEGIN 015_reacondicionado_tests_schema.sql
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

-- <<< END 015_reacondicionado_tests_schema.sql

-- >>> BEGIN 016_user_kpis.sql
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

-- <<< END 016_user_kpis.sql

-- >>> BEGIN 017_px_providers.sql
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

-- <<< END 017_px_providers.sql

-- >>> BEGIN 018_box_code_sequence.sql
-- TC-ERP Multimedia - Secuencia global única para códigos de caja
-- Los códigos BOX-XXXXX deben ser únicos globalmente como las Órdenes de Servicio.
-- Se usa una secuencia de PostgreSQL (atómica) en lugar de MAX() cliente-side.

CREATE SEQUENCE IF NOT EXISTS public.box_code_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

-- Alinear secuencia: tablas vacías → primer nextval = 1; con datos → max+1 sin duplicar.
DO $$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(box_code, '[^0-9]', '', 'g'), '')::integer),
    0
  )
  INTO v_max
  FROM public.boxes
  WHERE box_code ~* '^BOX-[0-9]+$';

  IF v_max <= 0 THEN
    PERFORM setval('public.box_code_seq', 1, false);
  ELSE
    PERFORM setval('public.box_code_seq', v_max, true);
  END IF;
END $$;

-- Función RPC para obtener el siguiente código único (atómica, usa SECURITY DEFINER)
-- Nota: migraciones 124/125 redefinen formato sin LPAD truncante; aquí bootstrap coherente con BOX-{n}.
CREATE OR REPLACE FUNCTION public.next_box_code()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'BOX-' || nextval('public.box_code_seq')::text;
$$;

GRANT EXECUTE ON FUNCTION public.next_box_code() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- <<< END 018_box_code_sequence.sql

-- >>> BEGIN 019_os_code_sequence.sql
-- TC-ERP - Secuencia global única para Órdenes de Servicio (OS)
-- Cada equipo recibido en PX debe tener su propia OS con código único TC-XXXXXX
-- Se usa una secuencia PostgreSQL para garantizar unicidad sin condiciones de carrera.

CREATE SEQUENCE IF NOT EXISTS public.os_code_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

DO $$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(os_label, '[^0-9]', '', 'g'), '')::integer),
    0
  )
  INTO v_max
  FROM public.service_orders
  WHERE os_label ~* '^TC-[0-9]+$';

  IF v_max <= 0 THEN
    PERFORM setval('public.os_code_seq', 1, false);
  ELSE
    PERFORM setval('public.os_code_seq', v_max, true);
  END IF;
END $$;

-- Uso: SELECT next_os_codes(5) → '{TC-000001,TC-000002,...}'
CREATE OR REPLACE FUNCTION public.next_os_codes(count_needed integer)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  codes text[] := '{}';
  i integer;
BEGIN
  FOR i IN 1..count_needed LOOP
    codes := array_append(
      codes,
      'TC-' || LPAD(nextval('public.os_code_seq')::text, 6, '0')
    );
  END LOOP;
  RETURN codes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_os_codes(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- <<< END 019_os_code_sequence.sql

-- >>> BEGIN bootstrap_fragments/001_technologies_catalog.sql
-- Catálogo technologies + FK en models (referenciado desde 015_taller_kpi_goals y toda la app).
-- No existía en migraciones versionadas; bases productivas lo tenían desde SQL manual.

CREATE TABLE IF NOT EXISTS public.technologies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  series_count integer NOT NULL DEFAULT 1,
  digits_per_series integer[] NOT NULL DEFAULT '{12}'::integer[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_technologies_name_normalized
  ON public.technologies (upper(trim(name)));

ALTER TABLE public.models
  ADD COLUMN IF NOT EXISTS technology_id uuid REFERENCES public.technologies(id) ON DELETE SET NULL;

ALTER TABLE public.models
  ADD COLUMN IF NOT EXISTS series_count integer;

ALTER TABLE public.models
  ADD COLUMN IF NOT EXISTS digits_per_series integer[];

ALTER TABLE public.technologies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS technologies_read ON public.technologies;
CREATE POLICY technologies_read ON public.technologies
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS technologies_write ON public.technologies;
CREATE POLICY technologies_write ON public.technologies
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- <<< END bootstrap_fragments/001_technologies_catalog.sql

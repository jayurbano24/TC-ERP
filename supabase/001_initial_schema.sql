-- TC-ERP Multimedia - Initial schema for Supabase
-- Run this script in Supabase SQL editor as project owner.

create extension if not exists pgcrypto;

-- =========================
-- Types
-- =========================
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

create type public.reception_source as enum ('cac', 'px');
create type public.box_status as enum ('open', 'closed', 'blocked');
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
create type public.service_order_status as enum ('open', 'in_progress', 'qc', 'closed', 'rejected');
create type public.dispatch_type as enum ('massive', 'individual', 'master_box', 'single_box');
create type public.finding_type as enum ('qty_mismatch', 'reprinted_serial', 'invalid_serial', 'equipment_issue', 'other');

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

create or replace function public.app_has_role(target_role public.app_role)
returns boolean
language sql
stable
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

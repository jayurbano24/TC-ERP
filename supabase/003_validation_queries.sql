-- TC-ERP Multimedia - Validation queries
-- Run after 001_initial_schema.sql and 002_seed_reference_data.sql

-- 1) Core tables existence
select tablename
from pg_catalog.pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'user_roles',
    'receptions',
    'boxes',
    'series',
    'service_orders',
    'workshop_jobs',
    'qc_checks',
    'inventory_movements',
    'dispatches',
    'dispatch_items'
  )
order by tablename;

-- 2) Policy existence
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) Seed overview
select 'brands' as entity, count(*) as total from public.brands
union all
select 'clients' as entity, count(*) as total from public.clients
union all
select 'agencies' as entity, count(*) as total from public.agencies;

-- 4) Roles enum values
select unnest(enum_range(null::public.app_role)) as role;

-- TC-ERP Multimedia - Reference seed data
-- Run after 001_initial_schema.sql

insert into public.brands (code, name)
values
  ('HUA', 'Huawei'),
  ('NOK', 'Nokia'),
  ('SAG', 'Sagemcom'),
  ('ZTE', 'ZTE')
on conflict (code) do nothing;

insert into public.clients (code, name)
values
  ('TC-DEFAULT', 'Tech Corps Default Client')
on conflict (code) do nothing;

with base_client as (
  select id from public.clients where code = 'TC-DEFAULT' limit 1
)
insert into public.agencies (client_id, code, name)
select base_client.id, agency.code, agency.name
from base_client,
(
  values
    ('AG-001', 'Agencia Centro'),
    ('AG-002', 'Agencia Norte'),
    ('AG-003', 'Agencia Sur')
) as agency(code, name)
on conflict (client_id, code) do nothing;

-- Optional: create profile rows for existing auth users.
insert into public.profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
from auth.users u
on conflict (id) do nothing;

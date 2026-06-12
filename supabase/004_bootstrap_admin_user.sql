-- TC-ERP Multimedia - Bootstrap first admin user
-- Run this after creating at least one user in Supabase Auth.
-- Update target_email before executing.

-- 0) Optional pre-check: list available auth users.
select id, email, created_at
from auth.users
order by created_at desc;

do $$
declare
  target_email text := 'gurbano@techcommwireless.com';
  target_user_id uuid;
  selected_email text;
  total_auth_users bigint;
begin
  select count(*) into total_auth_users from auth.users;

  if total_auth_users = 0 then
    raise exception 'No users found in auth.users'
      using hint = 'Create the first user in Supabase Dashboard > Authentication > Users > Add user, then run this script again.';
  end if;

  if target_email is null or btrim(target_email) = '' or target_email = 'tu_correo@techcorps.com' then
    select u.id, u.email
    into target_user_id, selected_email
    from auth.users u
    order by u.created_at desc
    limit 1;
  else
    select u.id, u.email
    into target_user_id, selected_email
    from auth.users u
    where lower(u.email) = lower(target_email)
    limit 1;
  end if;

  if target_user_id is null then
    raise exception 'No auth user found for email: %', target_email
      using hint = 'Use an existing email from auth.users or leave target_email as placeholder to auto-pick the latest user.';
  end if;

  raise notice 'Using auth user: %', selected_email;

  insert into public.profiles (id, full_name)
  select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
  from auth.users u
  where u.id = target_user_id
  on conflict (id) do update
    set full_name = excluded.full_name,
        updated_at = now();

  insert into public.user_roles (user_id, role)
  values
    (target_user_id, 'admin'),
    (target_user_id, 'supervisor')
  on conflict (user_id, role) do nothing;
end;
$$;

-- Verify recent admin/supervisor assignments
select p.id, p.full_name, ur.role
from public.profiles p
join public.user_roles ur on ur.user_id = p.id
where ur.role in ('admin', 'supervisor')
order by ur.created_at desc, ur.role
limit 20;

-- TC-ERP Multimedia - Bootstrap admin by explicit user_id
-- Use this when email lookup is failing.

-- 0) Find candidate users and copy one id
select id, email, created_at
from auth.users
order by created_at desc;

-- 1) Paste an existing auth.users id below
-- Example: '11111111-2222-3333-4444-555555555555'
do $$
declare
  target_user_id uuid := '00000000-0000-0000-0000-000000000000';
  placeholder_user_id uuid := '00000000-0000-0000-0000-000000000000';
  effective_user_id uuid;
  selected_email text;
  total_auth_users bigint;
begin
  select count(*) into total_auth_users from auth.users;

  if total_auth_users = 0 then
    raise exception 'No users found in auth.users'
      using hint = 'Create the first user in Supabase Dashboard > Authentication > Users > Add user, then run this script again.';
  end if;

  if target_user_id = placeholder_user_id then
    select u.id, u.email
    into effective_user_id, selected_email
    from auth.users u
    order by u.created_at desc
    limit 1;
  else
    effective_user_id := target_user_id;
  end if;

  if selected_email is null then
  select u.email
  into selected_email
  from auth.users u
    where u.id = effective_user_id
  limit 1;
  end if;

  if selected_email is null then
    raise exception 'No auth user found for id: %', effective_user_id
      using hint = 'Copy a real id from the query result above and replace target_user_id, or leave the placeholder to auto-pick latest user.';
  end if;

  raise notice 'Using auth user id: %, email: %', effective_user_id, selected_email;

  insert into public.profiles (id, full_name)
  select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
  from auth.users u
  where u.id = effective_user_id
  on conflict (id) do update
    set full_name = excluded.full_name,
        updated_at = now();

  insert into public.user_roles (user_id, role)
  values
    (effective_user_id, 'admin'),
    (effective_user_id, 'supervisor')
  on conflict (user_id, role) do nothing;
end;
$$;

-- 2) Verify recent admin/supervisor assignments
select p.id, p.full_name, ur.role
from public.profiles p
join public.user_roles ur on ur.user_id = p.id
where ur.role in ('admin', 'supervisor')
order by ur.created_at desc, ur.role
limit 20;

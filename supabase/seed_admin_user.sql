-- ============================================================================
-- Crear / asegurar un usuario ADMIN REAL en Supabase Auth (reemplazo del bypass)
-- ============================================================================
-- Contexto: el "dev bypass" (admin123 en localStorage) es forjable. Para
-- eliminarlo necesitamos un usuario real en Supabase Auth con rol Administrador.
--
-- RECOMENDADO (Parte A): crea el usuario desde el Dashboard y asígnale el rol
-- con el bloque SQL de abajo. Es independiente de la versión de GoTrue y no
-- toca el esquema interno `auth`.
--
-- ALTERNATIVA (Parte B): si prefieres SQL puro, descomenta el bloque del final
-- (puede requerir ajustes según la versión de Supabase).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PARTE A (recomendada)
-- ----------------------------------------------------------------------------
-- 1) En el Dashboard de Supabase: Authentication -> Users -> "Add user".
--    - Email:    admin@techcommwireless.com   (o el que prefieras)
--    - Password: (una contraseña fuerte)
--    - Marca "Auto Confirm User".
--
-- 2) Ejecuta este bloque para crear el profile y asignar el rol Administrador.
--    Cambia el email si usaste otro.

do $$
declare
  v_email       text := 'admin@techcommwireless.com';
  v_user_id     uuid;
  v_admin_role  uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(v_email);
  if v_user_id is null then
    raise exception 'No existe el usuario % en auth.users. Créalo primero en el Dashboard (Parte A, paso 1).', v_email;
  end if;

  -- profile (idempotente)
  insert into public.profiles (id, full_name, is_active)
  values (v_user_id, 'Administrador', true)
  on conflict (id) do update set is_active = true;

  -- rol maestro Administrador (creado por create_erp_roles_permissions.sql)
  select id into v_admin_role from public.erp_roles where name = 'Administrador';

  -- asignación en user_roles (role text = 'Administrador' para que isAdminNavRole lo reconozca)
  insert into public.user_roles (user_id, role, role_id)
  values (v_user_id, 'Administrador', v_admin_role)
  on conflict (user_id, role) do update set role_id = excluded.role_id;

  raise notice 'Admin real listo: % (user_id=%)', v_email, v_user_id;
end $$;

-- Verificación rápida:
-- select u.email, p.full_name, ur.role, ur.role_id
-- from auth.users u
-- join public.profiles p on p.id = u.id
-- left join public.user_roles ur on ur.user_id = u.id
-- where lower(u.email) = lower('admin@techcommwireless.com');


-- ----------------------------------------------------------------------------
-- PARTE B (alternativa: creación 100% por SQL) — descomentar si NO usas el Dashboard
-- ----------------------------------------------------------------------------
-- NOTA: requiere pgcrypto y puede variar según la versión de Supabase/GoTrue.
--
-- do $$
-- declare
--   v_email    text := 'admin@techcommwireless.com';
--   v_password text := 'CAMBIA_ESTA_CLAVE_FUERTE';
--   v_user_id  uuid;
-- begin
--   select id into v_user_id from auth.users where lower(email) = lower(v_email);
--   if v_user_id is null then
--     v_user_id := gen_random_uuid();
--     insert into auth.users (
--       instance_id, id, aud, role, email, encrypted_password,
--       email_confirmed_at, created_at, updated_at,
--       raw_app_meta_data, raw_user_meta_data, is_super_admin
--     ) values (
--       '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
--       lower(v_email), crypt(v_password, gen_salt('bf')),
--       now(), now(), now(),
--       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false
--     );
--     insert into auth.identities (
--       provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
--     ) values (
--       v_user_id::text, v_user_id,
--       jsonb_build_object('sub', v_user_id::text, 'email', lower(v_email)),
--       'email', now(), now(), now()
--     );
--   end if;
--   -- luego ejecuta el bloque de PARTE A para profile + rol.
-- end $$;

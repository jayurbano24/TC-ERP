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

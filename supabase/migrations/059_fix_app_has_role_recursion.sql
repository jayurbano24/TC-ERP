-- =============================================================================
-- 059 — Fix recursión RLS: "stack depth limit exceeded"
-- =============================================================================
-- Síntoma: la Bandeja de Entrada (CAC) y otras vistas fallan al cargar con
-- ERROR "stack depth limit exceeded". No se ven recepciones.
--
-- Causa raíz:
--   public.app_has_role() estaba declarada SECURITY INVOKER y hace
--   `select ... from public.user_roles`. Pero la política `user_roles_admin_write`
--   es FOR ALL (aplica también a SELECT) y su USING llama a app_has_role('admin').
--   Resultado: leer user_roles -> evalúa política -> app_has_role() -> lee
--   user_roles -> evalúa política -> app_has_role() -> ... recursión infinita.
--   Lo mismo ocurre al leer `profiles` (su política llama app_has_role) y, por el
--   join embebido received_by->profiles, al consultar `receptions`.
--
-- Fix:
--   Redefinir app_has_role() como SECURITY DEFINER con search_path fijo. Así su
--   consulta interna a user_roles NO vuelve a evaluar RLS y se rompe el ciclo.
--   Es el patrón recomendado por Supabase para funciones usadas en políticas.
--
-- Idempotente: create or replace + revoke/grant repetibles.
-- =============================================================================

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

-- La función solo necesita ser ejecutable por los roles de la app; no exponerla
-- a PUBLIC más de lo necesario.
revoke all on function public.app_has_role(public.app_role) from public;
grant execute on function public.app_has_role(public.app_role) to authenticated, anon, service_role;

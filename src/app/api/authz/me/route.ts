import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { loadUserAuthz } from '@/shared/authz/permissions';
import { hasErpBodegaDespachoWrite } from '@/shared/authz/canDo';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  invalidateOperationalRolesCache,
  loadOperationalEnumRoles,
  ROLES_BODEGA_DESPACHO,
  userHasAnyOperationalRole,
} from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/authz/me — Endpoint ADITIVO de solo lectura (Commit 6, UX).
 *
 * Devuelve EXCLUSIVAMENTE los permisos del PROPIO solicitante (resueltos por su
 * identidad de sesión), para que el frontend pueda decidir qué mostrar/ocultar/
 * deshabilitar. NO es un mecanismo de seguridad: la autoridad real sigue siendo
 * el backend (roleGuard/endpoints/RLS). No modifica contratos existentes.
 */
export async function GET(req: Request) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  const authz = await loadUserAuthz(auth.user.id);
  let operationalRoles = await loadOperationalEnumRoles(auth.user.id);
  let hasEnumBodegaDespacho = await userHasAnyOperationalRole(
    auth.user.id,
    ROLES_BODEGA_DESPACHO
  );
  const erpBodegaDespachoWrite = hasErpBodegaDespachoWrite(authz);

  if (erpBodegaDespachoWrite && !hasEnumBodegaDespacho) {
    try {
      const supabase = getSupabaseServerClient();
      await supabase.rpc('app_sync_operational_role_from_erp_modules', {
        p_user_id: auth.user.id,
      });
      invalidateOperationalRolesCache(auth.user.id);
      operationalRoles = await loadOperationalEnumRoles(auth.user.id);
      hasEnumBodegaDespacho = await userHasAnyOperationalRole(
        auth.user.id,
        ROLES_BODEGA_DESPACHO
      );
    } catch {
      // Best-effort: UI/RPC siguen con puente ERP aunque falle el sync.
    }
  }

  const canBodegaDespachoRpc = hasEnumBodegaDespacho || erpBodegaDespachoWrite;
  return NextResponse.json(
    {
      ...authz,
      email: auth.user.email ?? null,
      operationalRoles,
      /** Alineado a app_assert_any_role(admin|supervisor|bodega) + permisos ERP tras migración 269. */
      canBodegaDespachoRpc,
    },
    {
      headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' },
    }
  );
}

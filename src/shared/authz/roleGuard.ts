import { NextResponse } from 'next/server';
import { getSupabaseUserServerClient } from '@/lib/supabase/server-user';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';

/**
 * Guard de rol OPERACIONAL (enum `app_role`) en el borde de los endpoints.
 *
 * Estrategia LOG-ONLY → ENFORCE (ADR-011 §11.6, decisión "keep_enum"):
 *   - Por defecto SOLO registra la decisión (allow/deny) con el correlation id;
 *     NO bloquea. Esto recolecta datos de cobertura real sin riesgo de regresión.
 *   - Si `AUTHZ_ENFORCE === 'true'` (env server-only, default off), entonces
 *     además bloquea con 403 cuando el usuario no tiene ninguno de los roles.
 *
 * El vocabulario aquí es el OPERACIONAL (`user_roles.role` vía enum), que es el
 * que usan las políticas RLS vivas — NO la matriz por puesto (`erp_role_permissions`).
 */

/** Roles operacionales (subconjunto del enum app_role usado por las políticas). */
export type OperationalRole =
  | 'admin'
  | 'supervisor'
  | 'receptor_cac'
  | 'receptor_px'
  | 'bodega'
  | 'tecnico'
  | 'qc'
  | 'gerencia';

// Matriz rol→operación aprobada (ADR-011 §11.6). Reutilizable por endpoint.
export const ROLES_RECEPCION: OperationalRole[] = ['admin', 'supervisor', 'receptor_px', 'receptor_cac'];
export const ROLES_BODEGA_DESPACHO: OperationalRole[] = ['admin', 'supervisor', 'bodega'];
export const ROLES_PRODUCCION: OperationalRole[] = ['admin', 'supervisor', 'gerencia'];
export const ROLES_RETURNS_SAP: OperationalRole[] = ['admin', 'supervisor'];

const TTL_MS = 30_000;
const cache = new Map<string, { roles: string[]; ts: number }>();

async function loadEnumRoles(userId: string): Promise<string[]> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.roles;

  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId);
  const roles = (data ?? [])
    .map((r) => String((r as { role?: string }).role ?? ''))
    .filter(Boolean);

  cache.set(userId, { roles, ts: Date.now() });
  return roles;
}

export function authzEnforced(): boolean {
  return process.env.AUTHZ_ENFORCE === 'true';
}

/**
 * Evalúa los roles operacionales del usuario contra `allowed` y registra la
 * decisión. Devuelve un 403 SOLO si el enforce está activado y la decisión es deny;
 * en cualquier otro caso devuelve null (no bloquea). Nunca lanza.
 */
export async function logOnlyRoleCheck(
  req: Request,
  allowed: readonly string[],
  meta: { module: string; action: string }
): Promise<NextResponse | null> {
  try {
    const correlationId = getCorrelationIdFromHeaders(req.headers);

    let userId: string | null = null;
    const userClient = await getSupabaseUserServerClient();
    if (userClient) {
      const { data } = await userClient.auth.getUser();
      userId = data?.user?.id ?? null;
    }

    if (!userId) {
      console.warn('[AUTHZ_LOGONLY] sin usuario resoluble', {
        correlationId,
        module: meta.module,
        action: meta.action,
      });
      return null;
    }

    const roles = await loadEnumRoles(userId);
    const allow = roles.some((r) => allowed.includes(r));
    const payload = {
      correlationId,
      userId,
      module: meta.module,
      action: meta.action,
      allowed,
      roles,
      decision: allow ? 'allow' : 'deny',
      enforce: authzEnforced(),
    };

    if (allow) console.info('[AUTHZ_LOGONLY] allow', payload);
    else console.warn('[AUTHZ_LOGONLY] deny', payload);

    if (authzEnforced() && !allow) {
      return NextResponse.json(
        { success: false, error: 'No autorizado para esta operación', correlationId },
        { status: 403 }
      );
    }
    return null;
  } catch (error) {
    // El guard jamás debe romper la petición; ante cualquier fallo, log y continuar.
    console.error('[AUTHZ_LOGONLY] error ignorado', error instanceof Error ? error.message : error);
    return null;
  }
}

import { NextResponse } from 'next/server';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';
import { loadUserAuthz, canDo } from './permissions';
import type { AuthzModule, PermAction } from './modules';

/**
 * Estrategia de despliegue (mandatada): LOG ONLY → VALIDACIÓN → ENFORCE.
 *
 * - Por defecto (`AUTHZ_ENFORCE` != 'true'): modo LOG-ONLY. Registra la decisión
 *   que se TOMARÍA pero NO bloquea (devuelve null). Sirve para recolectar la
 *   evidencia real (qué usuarios/roles fallarían) sin riesgo en producción.
 * - Con `AUTHZ_ENFORCE='true'` (env SOLO de servidor): bloquea con 403 si el
 *   usuario no tiene el permiso.
 *
 * No usa `NEXT_PUBLIC_` a propósito: el modo de enforcement no debe poder
 * activarse/leerse desde el cliente.
 */
export function authzEnforced(): boolean {
  return process.env.AUTHZ_ENFORCE === 'true';
}

export async function authorize(
  req: Request,
  userId: string,
  module: AuthzModule,
  action: PermAction
): Promise<NextResponse | null> {
  const correlationId = getCorrelationIdFromHeaders(req.headers);

  let allowed = false;
  let roleId: string | null = null;
  let isAdmin = false;
  let loadError: string | undefined;

  try {
    const authz = await loadUserAuthz(userId);
    roleId = authz.roleId;
    isAdmin = authz.isAdmin;
    allowed = canDo(authz, module, action);
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'authz load error';
    allowed = false;
  }

  const enforce = authzEnforced();

  console.info(
    JSON.stringify({
      level: allowed ? 'info' : 'warn',
      type: 'authz_decision',
      module,
      action,
      userId,
      roleId,
      isAdmin,
      allowed,
      enforce,
      correlationId,
      ...(loadError ? { loadError } : {}),
    })
  );

  if (enforce && !allowed) {
    return NextResponse.json(
      { success: false, error: 'No autorizado para esta acción', correlationId },
      { status: 403 }
    );
  }

  return null;
}

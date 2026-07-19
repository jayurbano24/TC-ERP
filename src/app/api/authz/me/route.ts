import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { loadUserAuthz } from '@/shared/authz/permissions';

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
  return NextResponse.json(
    { ...authz, email: auth.user.email ?? null },
    {
      headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' },
    }
  );
}

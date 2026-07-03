import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { resolveSessionActor } from '@/shared/infrastructure/session/resolveSessionActor';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/session/actor — identidad del operador (sin select desde el navegador).
 */
export async function GET(req: Request) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  const actor = await resolveSessionActor(auth.user);
  return NextResponse.json(actor, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}

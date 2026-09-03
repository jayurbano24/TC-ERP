import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO, ROLES_TALLER } from '@/shared/authz/roleGuard';
import { listPartMovements } from '@/modules/parts/server/partsService';

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const sp = new URL(req.url).searchParams;
    const items = await listPartMovements({
      q: sp.get('q') || undefined,
      catalogId: sp.get('catalogId') || undefined,
      movementType: sp.get('type') || undefined,
      limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
    });
    return NextResponse.json({ items });
  },
  { module: 'parts', action: 'movements_list', roles: [...ROLES_BODEGA_DESPACHO, ...ROLES_TALLER] }
);

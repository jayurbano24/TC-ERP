import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO, ROLES_TALLER } from '@/shared/authz/roleGuard';
import { listDispatchedSkusByServiceOrders } from '@/modules/parts/server/partsService';

const Uuid = z.string().uuid();

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const raw = new URL(req.url).searchParams.get('ids') || '';
    const ids = raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 100);
    if (ids.length === 0) return NextResponse.json({ items: [] });
    if (ids.some((id) => !Uuid.safeParse(id).success)) {
      return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 });
    }
    const items = await listDispatchedSkusByServiceOrders(ids);
    return NextResponse.json({ items });
  },
  { module: 'parts', action: 'os_dispatched_skus', roles: [...ROLES_TALLER, ...ROLES_BODEGA_DESPACHO] }
);

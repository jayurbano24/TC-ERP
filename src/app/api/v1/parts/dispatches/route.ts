import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { listPartDispatches } from '@/modules/parts/server/partsService';

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const items = await listPartDispatches();
    return NextResponse.json({ items });
  },
  { module: 'parts', action: 'dispatches_list', roles: ROLES_BODEGA_DESPACHO }
);

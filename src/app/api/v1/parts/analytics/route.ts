import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { getPartsAnalytics } from '@/modules/parts/server/partsService';

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const data = await getPartsAnalytics();
    return NextResponse.json(data);
  },
  { module: 'parts', action: 'analytics', roles: ROLES_BODEGA_DESPACHO }
);

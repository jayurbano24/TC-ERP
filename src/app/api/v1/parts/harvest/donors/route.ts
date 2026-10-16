import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { searchHarvestDonors } from '@/modules/parts/server/partsHarvestService';

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const url = new URL(req.url);
    const q = url.searchParams.get('q') ?? '';
    const items = await searchHarvestDonors(q);
    return NextResponse.json({ items });
  },
  { module: 'parts', action: 'harvest_donors', roles: ROLES_BODEGA_DESPACHO }
);

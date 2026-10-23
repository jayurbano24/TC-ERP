import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { searchHarvestDonors, searchHarvestDonorsBulk } from '@/modules/parts/server/partsHarvestService';

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

const BulkBody = z.object({
  serials: z.array(z.string().trim().min(1).max(160)).min(1).max(100),
});

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const parsed = BulkBody.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 422 });
    }
    const items = await searchHarvestDonorsBulk(parsed.data.serials);
    return NextResponse.json({ items });
  },
  { module: 'parts', action: 'harvest_donors_bulk', roles: ROLES_BODEGA_DESPACHO }
);

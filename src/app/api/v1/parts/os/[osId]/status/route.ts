import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO, ROLES_TALLER } from '@/shared/authz/roleGuard';
import { getOsPartStatus } from '@/modules/parts/server/partsService';

type Ctx = { params: Promise<{ osId: string }> };

export const GET = withErrorHandler(
  async (req: Request, context: Ctx) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { osId } = await context.params;
    if (!z.string().uuid().safeParse(osId).success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 });
    }
    const data = await getOsPartStatus(osId);
    return NextResponse.json(data);
  },
  { module: 'parts', action: 'os_status', roles: [...ROLES_TALLER, ...ROLES_BODEGA_DESPACHO] }
);

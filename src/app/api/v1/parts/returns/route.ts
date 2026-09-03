import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import {
  listPartReturns,
  listPendingReturns,
  receivePartReturn,
} from '@/modules/parts/server/partsService';

const Body = z.object({
  dispatchItemId: z.string().uuid(),
  status: z.enum(['RECEIVED', 'EVALUATED', 'SCRAP', 'VENDOR']).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const pending = new URL(req.url).searchParams.get('pending') === '1';
    const items = pending ? await listPendingReturns() : await listPartReturns();
    return NextResponse.json({ items });
  },
  { module: 'parts', action: 'returns_list', roles: ROLES_BODEGA_DESPACHO }
);

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 400 });
    }
    const result = await receivePartReturn({
      dispatchItemId: parsed.data.dispatchItemId,
      status: parsed.data.status,
      notes: parsed.data.notes,
      userId: auth.user?.id ?? null,
      userName: auth.user?.email ?? null,
    });
    return NextResponse.json({ result });
  },
  { module: 'parts', action: 'returns_receive', roles: ROLES_BODEGA_DESPACHO }
);

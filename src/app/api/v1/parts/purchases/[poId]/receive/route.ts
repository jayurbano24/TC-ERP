import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { receivePurchaseOrder } from '@/modules/parts/server/partsService';

type Ctx = { params: Promise<{ poId: string }> };

const Body = z.object({
  notes: z.string().max(1000).optional().nullable(),
});

export const POST = withErrorHandler(
  async (req: Request, context: Ctx) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { poId } = await context.params;
    if (!z.string().uuid().safeParse(poId).success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 });
    }
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    const receipt = await receivePurchaseOrder({
      poId,
      userId: auth.user?.id ?? null,
      notes: parsed.success ? parsed.data.notes : null,
    });
    return NextResponse.json({ receipt });
  },
  { module: 'parts', action: 'purchases_receive', roles: ROLES_BODEGA_DESPACHO }
);

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { reservePartRequestItem } from '@/modules/parts/server/partsService';

type Ctx = { params: Promise<{ itemId: string }> };

const Body = z.object({
  qty: z.number().int().positive().optional(),
  sourceType: z.enum(['NEW', 'RECOVERED']).optional(),
});

export const POST = withErrorHandler(
  async (req: Request, context: Ctx) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { itemId } = await context.params;
    if (!z.string().uuid().safeParse(itemId).success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 });
    }
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    const result = await reservePartRequestItem({
      requestItemId: itemId,
      qty: parsed.success ? parsed.data.qty : undefined,
      sourceType: parsed.success ? parsed.data.sourceType : undefined,
      userId: auth.user?.id ?? null,
    });
    return NextResponse.json(result);
  },
  { module: 'parts', action: 'request_reserve', roles: ROLES_BODEGA_DESPACHO }
);

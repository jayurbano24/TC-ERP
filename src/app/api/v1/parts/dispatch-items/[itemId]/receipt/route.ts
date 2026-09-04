import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';
import { confirmDispatchItemReceipt } from '@/modules/parts/server/partsService';

type Ctx = { params: Promise<{ itemId: string }> };

const Body = z.object({
  received: z.boolean(),
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
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 });
    }
    const result = await confirmDispatchItemReceipt({
      dispatchItemId: itemId,
      received: parsed.data.received,
      userId: auth.user?.id ?? null,
      userName: auth.user?.email ?? null,
    });
    return NextResponse.json(result);
  },
  { module: 'parts', action: 'dispatch_item_receipt', roles: ROLES_TALLER }
);

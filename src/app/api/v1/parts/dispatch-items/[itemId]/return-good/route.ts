import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';
import { returnUnusedGoodPart } from '@/modules/parts/server/partsService';

type Ctx = { params: Promise<{ itemId: string }> };

const Body = z.object({
  notes: z.string().max(500).optional().nullable(),
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
    const result = await returnUnusedGoodPart({
      dispatchItemId: itemId,
      notes: parsed.success ? parsed.data.notes : null,
      userId: auth.user?.id ?? null,
      userName: auth.user?.email ?? null,
    });
    return NextResponse.json(result);
  },
  { module: 'parts', action: 'dispatch_item_return_good', roles: ROLES_TALLER }
);

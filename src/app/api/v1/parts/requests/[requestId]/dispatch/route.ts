import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { dispatchPartRequest } from '@/modules/parts/server/partsService';

type Ctx = { params: Promise<{ requestId: string }> };

const Body = z.object({
  notes: z.string().max(1000).optional().nullable(),
  sourceType: z.enum(['NEW', 'RECOVERED']).optional(),
});

export const POST = withErrorHandler(
  async (req: Request, context: Ctx) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { requestId } = await context.params;
    if (!z.string().uuid().safeParse(requestId).success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 });
    }
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    const dispatch = await dispatchPartRequest({
      requestId,
      userId: auth.user?.id ?? null,
      userName: auth.user?.email ?? null,
      notes: parsed.success ? parsed.data.notes : null,
      sourceType: parsed.success ? parsed.data.sourceType : undefined,
    });
    return NextResponse.json({ dispatch });
  },
  { module: 'parts', action: 'request_dispatch', roles: ROLES_BODEGA_DESPACHO }
);

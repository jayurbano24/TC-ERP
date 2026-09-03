import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { dispatchPartRequestBatch } from '@/modules/parts/server/partsService';

type Context = { params: Promise<{ batchId: string }> };

const Body = z.object({
  notes: z.string().max(1000).optional().nullable(),
  sourceType: z.enum(['NEW', 'RECOVERED']).optional(),
});

export const POST = withErrorHandler(
  async (req: Request, context: Context) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { batchId } = await context.params;
    if (!z.string().uuid().safeParse(batchId).success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 });
    }
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    const result = await dispatchPartRequestBatch({
      batchId,
      userId: auth.user?.id ?? null,
      userName: auth.user?.email ?? null,
      notes: parsed.success ? parsed.data.notes : null,
      sourceType: parsed.success ? parsed.data.sourceType : undefined,
    });
    return NextResponse.json(result);
  },
  {
    module: 'parts',
    action: 'request_batch_dispatch',
    roles: ROLES_BODEGA_DESPACHO,
  }
);

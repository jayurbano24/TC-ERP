import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import {
  deleteOrRequestPartDeletion,
  listPartDeletionRequests,
  reviewPartDeletion,
} from '@/modules/parts/server/partsService';

const CreateBody = z.object({
  catalogId: z.string().uuid(),
  reason: z.string().min(5).max(500),
  observations: z.string().max(1000).optional().nullable(),
});

const ReviewBody = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  reviewNotes: z.string().max(1000).optional().nullable(),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const status = new URL(req.url).searchParams.get('status') || 'pending';
    const items = await listPartDeletionRequests(status, 100);
    return NextResponse.json({ items });
  },
  { module: 'parts', action: 'deletion_list', roles: ROLES_BODEGA_DESPACHO }
);

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json();

    if (body?.decision) {
      const parsed = ReviewBody.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 400 });
      }
      const result = await reviewPartDeletion({
        ...parsed.data,
        userId: auth.user?.id ?? null,
      });
      return NextResponse.json({ result });
    }

    const parsed = CreateBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 400 });
    }
    const result = await deleteOrRequestPartDeletion({
      ...parsed.data,
      userId: auth.user?.id ?? null,
    });
    return NextResponse.json(result);
  },
  { module: 'parts', action: 'deletion_write', roles: ROLES_BODEGA_DESPACHO }
);

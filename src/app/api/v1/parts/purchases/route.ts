import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { createPurchaseOrder, listPurchaseOrders } from '@/modules/parts/server/partsService';

const CreateBody = z.object({
  poNumber: z.string().min(1).max(64),
  supplier: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        catalogId: z.string().uuid(),
        qty: z.number().int().positive(),
        unitCost: z.number().nonnegative(),
      })
    )
    .min(1),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const items = await listPurchaseOrders();
    return NextResponse.json({ items });
  },
  { module: 'parts', action: 'purchases_list', roles: ROLES_BODEGA_DESPACHO }
);

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const parsed = CreateBody.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 400 });
    }
    const po = await createPurchaseOrder({
      ...parsed.data,
      userId: auth.user?.id ?? null,
    });
    return NextResponse.json({ po });
  },
  { module: 'parts', action: 'purchases_create', roles: ROLES_BODEGA_DESPACHO }
);

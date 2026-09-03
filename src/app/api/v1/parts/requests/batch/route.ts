import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO, ROLES_TALLER } from '@/shared/authz/roleGuard';
import { createPartRequestBatch } from '@/modules/parts/server/partsService';

const Body = z.object({
  catalogId: z.string().uuid(),
  // El lote entrega una pieza por orden; la UI no permite editarlo.
  qtyPerOrder: z.literal(1),
  priority: z.enum(['NORMAL', 'URGENTE']).optional(),
  reason: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  technicianName: z.string().max(120).optional().nullable(),
  orders: z
    .array(
      z.object({
        serviceOrderId: z.string().uuid(),
        seriesId: z.string().uuid().optional().nullable(),
        seriesIds: z.array(z.string().uuid()).max(100).optional(),
        serialNumber: z.string().max(64).optional().nullable(),
        serialNumbers: z.array(z.string().max(64)).max(100).optional(),
        brandId: z.string().uuid().optional().nullable(),
        modelId: z.string().uuid().optional().nullable(),
      })
    )
    .min(2)
    .max(100),
});

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const result = await createPartRequestBatch({
      ...parsed.data,
      technicianId: auth.user?.id ?? null,
    });
    return NextResponse.json(result);
  },
  {
    module: 'parts',
    action: 'requests_batch_create',
    roles: [...ROLES_TALLER, ...ROLES_BODEGA_DESPACHO],
  }
);

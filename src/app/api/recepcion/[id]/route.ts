import { NextResponse } from 'next/server';
import {
  markReceptionDeletedByWarehouse,
  updateReceptionSapDocument,
} from '@/modules/recepcion/server/receptionReads';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  sapDocument: z.string().min(1).max(120).optional(),
  status: z.literal('ELIMINADO POR BODEGA').optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { id } = await context.params;
  const body = await parseJsonBody(req, patchSchema);

  if (body.sapDocument) {
    await updateReceptionSapDocument(id, body.sapDocument.trim());
  } else if (body.status === 'ELIMINADO POR BODEGA') {
    await markReceptionDeletedByWarehouse(id);
  } else {
    return NextResponse.json({ success: false, error: 'Nada que actualizar.' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}, { module: 'recepcion-history', action: 'patch', roles: ROLES_RECEPCION });

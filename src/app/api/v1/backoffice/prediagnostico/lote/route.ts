import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { ROLES_PREDIAGNOSTICO_WRITE, userHasAnyOperationalRole } from '@/shared/authz/roleGuard';
import { assertUniformBatch } from '@/modules/backoffice/prediagnostico/batchSelection';
import { savePrediagnosticoBatch } from '@/modules/backoffice/prediagnostico/prediagnosticoService';
import { createPrediagnosticoStore } from '@/modules/backoffice/prediagnostico/supabasePrediagnosticoStore';

const Body = z.object({
  serviceOrderIds: z.array(z.string().uuid()).min(1).max(25),
  shellClass: z.string().nullable(),
  cosmetics: z.record(z.string(), z.string()).default({}),
  functionChecks: z.record(z.string(), z.string()).default({}),
  verdict: z.string().nullable(),
  notes: z.string().max(2000).default(''),
});

function actorName(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const meta = user.user_metadata || {};
  const full = typeof meta.full_name === 'string' ? meta.full_name : '';
  const name = typeof meta.name === 'string' ? meta.name : '';
  return full || name || user.email || 'Usuario';
}

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const canEdit = await userHasAnyOperationalRole(auth.user.id, ROLES_PREDIAGNOSTICO_WRITE);
    if (!canEdit) {
      return NextResponse.json(
        { error: 'Solo backoffice/CAC puede guardar el prediagnóstico.' },
        { status: 403 }
      );
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Selecciona entre 1 y 25 órdenes válidas' }, { status: 400 });
    }

    const db = getSupabaseServerClient();
    const tray = await db
      .from('cac_tray_units')
      .select('service_order_id, tech_id, model_id')
      .in('service_order_id', parsed.data.serviceOrderIds);

    if (tray.error) {
      return NextResponse.json(
        { error: 'No se pudo validar que las órdenes sean del mismo modelo y tecnología.' },
        { status: 503 }
      );
    }

    const rows = (tray.data || []).map((row) => ({
      serviceOrderId: String(row.service_order_id),
      techId: String(row.tech_id || ''),
      modelId: String(row.model_id || ''),
    }));
    const mismatch = assertUniformBatch(rows, parsed.data.serviceOrderIds);
    if (mismatch) {
      return NextResponse.json({ error: mismatch }, { status: 400 });
    }

    const { serviceOrderIds, ...input } = parsed.data;
    const saved = await savePrediagnosticoBatch(
      createPrediagnosticoStore(db),
      { userId: auth.user.id, userName: actorName(auth.user) },
      input,
      serviceOrderIds
    );
    return NextResponse.json({ saved: saved.length });
  },
  { module: 'backoffice', action: 'prediagnostico.batch', roles: ROLES_PREDIAGNOSTICO_WRITE }
);

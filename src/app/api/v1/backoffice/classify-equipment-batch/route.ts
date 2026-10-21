import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appConfig } from '@/lib/app-config';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser, type ApiAuthResult } from '@/shared/infrastructure/http/requireApiUser';
import { ROLES_RECEPCION, userHasAnyOperationalRole } from '@/shared/authz/roleGuard';
import { runClassifyEquipmentBatchChunked } from '@/modules/sap-transfer/infrastructure/rpc/classify-equipment-batch-runner';

function supabaseClientForClassify(auth: ApiAuthResult): SupabaseClient | null {
  if (auth.supabase) return auth.supabase;
  if (!auth.token || !appConfig.supabase.configured) return null;
  return createClient(appConfig.supabase.url, appConfig.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${auth.token}` } },
  });
}

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const UnitSchema = z.object({
  main_serial: z.string().min(1),
  model_id: z.string().min(1),
  brand_id: z.string().min(1),
  all_series: z.array(z.string()).min(1),
  material: z.string().optional(),
});

const BodySchema = z.object({
  receptionId: z.string().uuid(),
  sapTransferId: z.string().uuid(),
  units: z.array(UnitSchema).min(1).max(50),
  registeredBy: z.string().min(1),
  correlationId: z.string().optional(),
});

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const allowed = await userHasAnyOperationalRole(auth.user.id, ROLES_RECEPCION);
    if (!allowed) {
      return NextResponse.json({ error: 'Sin permiso para clasificar equipos.' }, { status: 403 });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Body no válido', issues: parsed.error.issues }, { status: 400 });
    }

    const db = supabaseClientForClassify(auth);
    if (!db) {
      return NextResponse.json(
        { error: 'No se pudo abrir sesión Supabase para clasificar.' },
        { status: 500 },
      );
    }

    const result = await runClassifyEquipmentBatchChunked(db, parsed.data);

    return NextResponse.json(result, { status: 200 });
  },
  { module: 'backoffice', action: 'classify_equipment_batch', roles: ROLES_RECEPCION },
);

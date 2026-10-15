import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { userHasAnyOperationalRole } from '@/shared/authz/roleGuard';
import { resolvePrediagnosticoBackfillCutoff } from '@/modules/backoffice/prediagnostico/prediagnosticoBackfillConfig';
import {
  backfillAggregatesToRates,
  runPrediagnosticoBackfillAll,
  runPrediagnosticoBackfillBatch,
} from '@/modules/backoffice/prediagnostico/prediagnosticoBackfillService';

const ROLES_BACKFILL = ['admin', 'supervisor'] as const;

const Body = z.object({
  dryRun: z.boolean().default(true),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
  cutoff: z.string().datetime({ offset: true }).optional(),
  asOf: z.string().datetime({ offset: true }).optional(),
  confirmApply: z.boolean().optional(),
  runAll: z.boolean().optional(),
  maxBatches: z.number().int().min(1).max(500).optional(),
});

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const allowed = await userHasAnyOperationalRole(auth.user.id, [...ROLES_BACKFILL]);
    if (!allowed) {
      return NextResponse.json({ error: 'Sin permiso para backfill de pre-diagnóstico.' }, { status: 403 });
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Body no válido' }, { status: 400 });
    }

    const confirmHeader = req.headers.get('X-Backfill-Confirm') === 'CHG-015';
    const dryRun = parsed.data.dryRun !== false;
    if (!dryRun && !confirmHeader && !parsed.data.confirmApply) {
      return NextResponse.json(
        {
          error:
            'Apply bloqueado: envíe dryRun:false con header X-Backfill-Confirm: CHG-015 o confirmApply:true.',
        },
        { status: 400 }
      );
    }

    let cutoff: Date;
    try {
      cutoff = resolvePrediagnosticoBackfillCutoff(parsed.data.cutoff);
    } catch (err: unknown) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Fecha de corte no configurada' },
        { status: 400 }
      );
    }

    const asOf = parsed.data.asOf ? new Date(parsed.data.asOf) : new Date();

    const runOpts = {
      dryRun,
      cutoff,
      asOf,
      limit: parsed.data.limit,
      actorUserId: auth.user.id,
      confirmApply: parsed.data.confirmApply || confirmHeader,
    };

    const result = parsed.data.runAll
      ? await runPrediagnosticoBackfillAll(getSupabaseServerClient(), {
          ...runOpts,
          maxBatches: parsed.data.maxBatches,
        })
      : await runPrediagnosticoBackfillBatch(getSupabaseServerClient(), {
          ...runOpts,
          offset: parsed.data.offset,
        });

    return NextResponse.json({
      ...result,
      rates: backfillAggregatesToRates(result.aggregates),
    });
  },
  { module: 'backoffice', action: 'prediagnostico.backfill', roles: ['admin', 'supervisor'] }
);

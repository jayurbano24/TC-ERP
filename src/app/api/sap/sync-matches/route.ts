import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { rpcInternal } from '@/lib/supabase/rpcInternal';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RETURNS_SAP } from '@/shared/authz/roleGuard';
import { parseJsonBody } from '@/shared/validation/parseRequest';

export const dynamic = 'force-dynamic';
/** Sync G985 completo puede superar 60s con muchos matches. */
export const maxDuration = 300;

/**
 * Sync compacto: solo series/equipos con match + reset set-based en BD.
 */
const SyncMatchesSchema = z.object({
  fileInfo: z.object({
    name: z.string().min(1).max(400),
    hash: z.string().max(128).optional().default(''),
    totalRows: z.coerce.number().int().nonnegative().optional().default(0),
    user: z.string().max(160).optional().default('Desconocido'),
  }),
  results: z.object({
    encontrados: z.coerce.number().int().nonnegative().optional().default(0),
    noEncontrados: z.coerce.number().int().nonnegative().optional().default(0),
    inconsistencias: z.coerce.number().int().nonnegative().optional().default(0),
    timeStr: z.string().max(60).optional().default(''),
  }),
  matchedSeries: z
    .array(
      z.object({
        id: z.string().uuid(),
        material: z.string().max(120).nullable().optional(),
        valuation: z.string().max(120).nullable().optional(),
      })
    )
    .max(100_000)
    .default([]),
  matchedEquipos: z
    .array(
      z.object({
        id: z.string().uuid(),
        sap_integration_status: z.string().max(120),
      })
    )
    .max(100_000)
    .default([]),
  // Solo coincidencias (no se envían “Sin Coincidencia” → bajo egress)
  validationDetails: z.array(z.record(z.string(), z.unknown())).max(100_000).optional().default([]),
  resetUnmatched: z.boolean().optional().default(true),
});

export const POST = withErrorHandler(async (request: Request) => {
  const body = await parseJsonBody(request, SyncMatchesSchema);
  const supabase = getSupabaseServerClient();

  const { data, error } = await rpcInternal(supabase, 'sap_sync_matches_tx', {
    p_file_info: body.fileInfo,
    p_results: body.results,
    p_matched_series: body.matchedSeries,
    p_matched_equipos: body.matchedEquipos,
    p_validation_details: body.validationDetails,
    p_reset_unmatched: body.resetUnmatched,
  });

  if (error) {
    // Fallback legacy: internal.sap_sync_tx
    if (/sap_sync_matches_tx|function|PGRST/i.test(error.message || '')) {
      const seriesUpdates = body.matchedSeries.map((s) => ({
        id: s.id,
        sap_status: 'Validado',
      }));
      const { data: legacy, error: legacyErr } = await rpcInternal(supabase, 'sap_sync_tx', {
        p_file_info: body.fileInfo,
        p_results: body.results,
        p_validation_details: body.validationDetails,
        p_equipos_updates: body.matchedEquipos,
        p_series_updates: seriesUpdates,
      });
      if (legacyErr) throw legacyErr;
      return NextResponse.json({
        success: true,
        sessionId: (legacy as { session_id?: string } | null)?.session_id ?? null,
        mode: 'legacy',
      });
    }
    throw error;
  }

  const payload = data as {
    session_id?: string;
    series_matched?: number;
    series_unmatched?: number;
    equipos_matched?: number;
    equipos_unmatched?: number;
  } | null;

  return NextResponse.json({
    success: true,
    sessionId: payload?.session_id ?? null,
    mode: 'compact',
    stats: {
      seriesMatched: payload?.series_matched ?? body.matchedSeries.length,
      seriesUnmatched: payload?.series_unmatched ?? 0,
      equiposMatched: payload?.equipos_matched ?? body.matchedEquipos.length,
      equiposUnmatched: payload?.equipos_unmatched ?? 0,
    },
  });
}, { module: 'sap', action: 'sync-matches', roles: ROLES_RETURNS_SAP });

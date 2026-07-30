import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { rpcInternal } from '@/lib/supabase/rpcInternal';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RETURNS_SAP } from '@/shared/authz/roleGuard';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { BusinessException } from '@/shared/errors/Exceptions';

export const dynamic = 'force-dynamic';
/** Sync G985 completo puede superar 60s con muchos matches. */
export const maxDuration = 300;

/**
 * Sync compacto: solo series/equipos con match + reset set-based en BD.
 * Para G985 grandes (~20k matches) usa begin/apply/finalize por chunks.
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
  validationDetails: z.array(z.record(z.string(), z.unknown())).max(100_000).optional().default([]),
  resetUnmatched: z.boolean().optional().default(true),
});

const APPLY_CHUNK = 1_200;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out.length ? out : [[]];
}

async function syncChunked(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  body: z.infer<typeof SyncMatchesSchema>
) {
  const begin = await rpcInternal<{ upload_id?: string; session_id?: string }>(
    supabase,
    'sap_sync_matches_begin',
    {
      p_file_info: body.fileInfo,
      p_results: body.results,
    }
  );
  if (begin.error || !begin.data?.session_id) {
    throw new BusinessException(
      begin.error?.message || 'No se pudo iniciar sync SAP (migración 184 pendiente?).'
    );
  }

  const uploadId = begin.data.upload_id ?? null;
  const sessionId = begin.data.session_id!;
  const seriesChunks = chunkArray(body.matchedSeries, APPLY_CHUNK);
  const equipoChunks = chunkArray(body.matchedEquipos, APPLY_CHUNK);
  const detailChunks = chunkArray(body.validationDetails || [], APPLY_CHUNK);
  const steps = Math.max(seriesChunks.length, equipoChunks.length, detailChunks.length);

  for (let i = 0; i < steps; i++) {
    const apply = await rpcInternal(supabase, 'sap_sync_matches_apply_chunk', {
      p_session_id: sessionId,
      p_matched_series: seriesChunks[i] || [],
      p_matched_equipos: equipoChunks[i] || [],
      p_validation_details: detailChunks[i] || [],
    });
    if (apply.error) {
      throw new BusinessException(
        `Sync SAP lote ${i + 1}/${steps}: ${apply.error.message || 'falló'}`
      );
    }
  }

  const seriesIds = body.matchedSeries.map((s) => s.id);
  const equipoIds = body.matchedEquipos.map((e) => e.id);

  if (!body.resetUnmatched) {
    return {
      sessionId,
      uploadId,
      seriesMatched: seriesIds.length,
      seriesUnmatched: 0,
      equiposMatched: equipoIds.length,
      equiposUnmatched: 0,
    };
  }

  const fin = await rpcInternal<{
    series_unmatched?: number;
    equipos_unmatched?: number;
  }>(supabase, 'sap_sync_matches_finalize', {
    p_upload_id: uploadId,
    p_session_id: sessionId,
    p_matched_series_ids: seriesIds,
    p_matched_equipo_ids: equipoIds,
    p_reset_unmatched: true,
  });

  if (fin.error) {
    throw new BusinessException(`Sync SAP finalize: ${fin.error.message || 'falló'}`);
  }

  return {
    sessionId,
    uploadId,
    seriesMatched: seriesIds.length,
    seriesUnmatched: fin.data?.series_unmatched ?? 0,
    equiposMatched: equipoIds.length,
    equiposUnmatched: fin.data?.equipos_unmatched ?? 0,
  };
}

export const POST = withErrorHandler(
  async (req: Request) => {
    const body = await parseJsonBody(req, SyncMatchesSchema);
    const supabase = getSupabaseServerClient();

    const totalMatches = body.matchedSeries.length + body.matchedEquipos.length;

    // Archivos chicos: RPC monolítico (compatible sin 184).
    // Archivos grandes: chunked (requiere migración 184).
    if (totalMatches < 2_500) {
      const { data, error } = await rpcInternal(supabase, 'sap_sync_matches_tx', {
        p_file_info: body.fileInfo,
        p_results: body.results,
        p_matched_series: body.matchedSeries,
        p_matched_equipos: body.matchedEquipos,
        p_validation_details: body.validationDetails,
        p_reset_unmatched: body.resetUnmatched,
      });

      if (!error) {
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
      }

      // Si el monolítico falla, intentar chunked.
      console.warn('[sap/sync-matches] monolítico falló, probando chunked:', error.message);
    }

    try {
      const result = await syncChunked(supabase, body);
      return NextResponse.json({
        success: true,
        sessionId: result.sessionId,
        mode: 'chunked',
        stats: {
          seriesMatched: result.seriesMatched,
          seriesUnmatched: result.seriesUnmatched,
          equiposMatched: result.equiposMatched,
          equiposUnmatched: result.equiposUnmatched,
        },
      });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      // Fallback legacy monolítico si 184 no está aplicada
      if (/sap_sync_matches_begin|function|PGRST|184/i.test(msg)) {
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
        if (legacyErr) {
          throw new BusinessException(
            `Sync SAP falló. Aplique la migración 184 en Supabase. Detalle: ${legacyErr.message}`
          );
        }
        return NextResponse.json({
          success: true,
          sessionId: (legacy as { session_id?: string } | null)?.session_id ?? null,
          mode: 'legacy',
        });
      }
      throw new BusinessException(`Sync SAP falló: ${msg}`);
    }
  },
  { module: 'sap', action: 'sync-matches', roles: ROLES_RETURNS_SAP }
);

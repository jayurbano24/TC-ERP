import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';
import { resolveReadClient } from '@/shared/infrastructure/http/resolveReadClient';
import {
  aggregateOutboundBoxSeriesStats,
  type OutboundBoxSeriesStats,
} from '@/lib/api/aggregateOutboundBoxSeriesStats';

const BOX_SELECT =
  'id, box_code, brand_id, model_id, capacity, status, rack_location, material, valuation, created_at';

const ListQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(BATCH_LIMITS.API_PAGE_MAX).default(100),
  /** Filtro opcional por código Outbound (OB-000032, 32, etc.). */
  q: z.string().trim().max(80).optional(),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/despacho/boxes';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const { client: supabase } = resolveReadClient(auth.supabase);

    const parsed = ListQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { cursor, limit, q: searchQ } = parsed.data;

    const { data: recData } = await supabase
      .from('receptions')
      .select('id')
      .eq('guide_number', 'MANUAL_BOXES_DESPACHO')
      .maybeSingle();

    if (!recData?.id) {
      return NextResponse.json({ items: [], nextCursor: null });
    }

    let q = supabase
      .from('boxes')
      .select(BOX_SELECT)
      .eq('reception_id', recData.id)
      .eq('status', 'open')
      .neq('rack_location', 'ELIMINADO')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      // Over-fetch: tras filtrar keyset (created_at,id) aún llenamos la página.
      .limit(Math.min((limit + 1) * 3, 400));

    if (searchQ) {
      const raw = searchQ.replace(/%/g, '').trim();
      const digits = raw.replace(/^OB-/i, '').replace(/^0+/i, '') || raw;
      // "32" / "OB-32" / "OB-000032" → coincidencia por código
      q = q.ilike('box_code', `%${digits}%`);
    }

    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;
    if (cursor) {
      const { data: cursorBox } = await supabase
        .from('boxes')
        .select('created_at, id')
        .eq('id', cursor)
        .maybeSingle();
      if (cursorBox?.created_at) {
        cursorCreatedAt = String(cursorBox.created_at);
        cursorId = String(cursorBox.id);
        q = q.lte('created_at', cursorCreatedAt);
      }
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: 'QUERY_FAILED', detail: error.message }, { status: 500 });
    }

    let rows = data ?? [];
    if (cursorCreatedAt && cursorId) {
      rows = rows.filter((r) => {
        const ts = String(r.created_at ?? '');
        const id = String(r.id);
        if (ts < cursorCreatedAt) return true;
        if (ts > cursorCreatedAt) return false;
        return id < cursorId;
      });
    }
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const boxIds = page.map((b) => b.id);

    let statsByBox = new Map<string, OutboundBoxSeriesStats>();
    if (boxIds.length > 0) {
      try {
        statsByBox = await aggregateOutboundBoxSeriesStats(supabase, boxIds);
      } catch (seriesError) {
        // No tumbar el listado: la tabla debe pintar Outbounds aunque falle el conteo.
        const message = seriesError instanceof Error ? seriesError.message : String(seriesError);
        console.warn('[despacho/boxes] aggregateOutboundBoxSeriesStats:', message);
      }
    }

    const items = page.map((b) => {
      const stats = statsByBox.get(b.id) ?? {
        filled_count: 0,
        valorado_count: 0,
        novalorado_count: 0,
        series_preview: [] as string[],
      };
      return {
        ...b,
        filled_count: stats.filled_count,
        valorado_count: stats.valorado_count,
        novalorado_count: stats.novalorado_count,
        series_preview: stats.series_preview,
      };
    });

    const responseBody = {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : null,
    };

    logEgress({
      route,
      module: 'despacho',
      action: 'list_boxes',
      correlationId,
      rowCount: items.length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody);
  },
  { module: 'despacho', action: 'list_boxes', roles: ROLES_BODEGA_DESPACHO }
);

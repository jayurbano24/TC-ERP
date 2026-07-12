import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';

const BOX_SELECT =
  'id, box_code, brand_id, model_id, capacity, status, rack_location, material, valuation, created_at';

const ListQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(BATCH_LIMITS.API_PAGE_MAX).default(100),
});

function classifyValuation(raw: unknown): 'valorado' | 'novalorado' | 'otro' {
  const s = String(raw ?? '').trim();
  if (!s) return 'otro';
  if (/novalorad|no\s*valorad/i.test(s)) return 'novalorado';
  if (/valorado/i.test(s)) return 'valorado';
  return 'otro';
}

function looksLikeSapSn(sn: string): boolean {
  return /^\d{12,}$/.test(sn.trim());
}

export const GET = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/despacho/boxes';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;

    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    const parsed = ListQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { cursor, limit } = parsed.data;

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
      .order('id', { ascending: true })
      .limit(limit + 1);

    if (cursor) q = q.lt('id', cursor);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: 'QUERY_FAILED', detail: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, -1) : rows;
    const boxIds = page.map((b) => b.id);

    type Stats = {
      filled_count: number;
      valorado_count: number;
      novalorado_count: number;
      series_preview: string[];
    };
    const statsByBox = new Map<string, Stats>();
    for (const id of boxIds) {
      statsByBox.set(id, {
        filled_count: 0,
        valorado_count: 0,
        novalorado_count: 0,
        series_preview: [],
      });
    }

    if (boxIds.length > 0) {
      const { data: seriesRows, error: seriesError } = await supabase
        .from('series')
        .select('id, serial_number, current_box_id, material, valuation, service_order_id, created_at')
        .in('current_box_id', boxIds)
        .order('created_at', { ascending: true });

      if (seriesError) {
        return NextResponse.json({ error: 'QUERY_FAILED', detail: seriesError.message }, { status: 500 });
      }

      type Acc = {
        valuation: string;
        serials: string[];
      };
      const groups = new Map<string, Acc>(); // key = boxId|osKey

      for (const s of seriesRows ?? []) {
        const boxId = String(s.current_box_id);
        if (!statsByBox.has(boxId)) continue;
        const osKey = s.service_order_id ? String(s.service_order_id) : `solo:${s.id}`;
        const gKey = `${boxId}|${osKey}`;
        let acc = groups.get(gKey);
        if (!acc) {
          acc = { valuation: '', serials: [] };
          groups.set(gKey, acc);
        }
        const v = String(s.valuation ?? '').trim();
        if (!acc.valuation && v) acc.valuation = v;
        const sn = String(s.serial_number || '').trim();
        if (sn) acc.serials.push(sn);
      }

      for (const [gKey, acc] of groups) {
        const boxId = gKey.split('|')[0]!;
        const stats = statsByBox.get(boxId);
        if (!stats) continue;
        stats.filled_count += 1;
        const kind = classifyValuation(acc.valuation);
        if (kind === 'valorado') stats.valorado_count += 1;
        if (kind === 'novalorado') stats.novalorado_count += 1;

        const sapSn = acc.serials.find((sn) => looksLikeSapSn(sn)) || acc.serials[0];
        if (sapSn && stats.series_preview.length < 6) {
          stats.series_preview.push(sapSn);
        }
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

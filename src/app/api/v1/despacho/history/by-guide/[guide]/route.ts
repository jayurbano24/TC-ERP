import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';
import { resolveProfileDisplayNames } from '@/shared/infrastructure/profiles/resolveProfileDisplayNames';

function countEquiposByOs(
  items: Array<{ series?: { service_order_id?: string | null } | null; series_id?: string }> | null | undefined
): number {
  if (!items?.length) return 0;
  const keys = new Set<string>();
  for (const it of items) {
    const os = it.series?.service_order_id;
    if (os) keys.add(`os:${os}`);
    else if (it.series_id) keys.add(`s:${it.series_id}`);
  }
  return keys.size;
}

type RouteContext = { params: Promise<{ guide: string }> };

export const GET = withErrorHandler(
  async (req: Request, context: RouteContext) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/despacho/history/by-guide/[guide]';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;
    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    const { guide: rawGuide } = await context.params;
    const guide = decodeURIComponent(String(rawGuide || '')).trim();
    if (!guide || guide.length > 80) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', detail: 'Nº conduce inválido' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('dispatches')
      .select(
        `
        id,
        guide_number,
        dispatch_type,
        notes,
        dispatched_at,
        dispatched_by,
        box_id,
        boxes:box_id (
          id,
          box_code,
          brand_id,
          model_id,
          material,
          valuation,
          capacity,
          status
        ),
        dispatch_items (
          series_id,
          series:series_id (
            service_order_id,
            serial_number
          )
        )
      `
      )
      .eq('guide_number', guide)
      .order('dispatched_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'QUERY_FAILED', detail: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    if (!rows.length) {
      return NextResponse.json({ error: 'NOT_FOUND', detail: `Sin despachos para ${guide}` }, { status: 404 });
    }

    const userIds = rows.map((r) => r.dispatched_by).filter(Boolean) as string[];
    const names = await resolveProfileDisplayNames(userIds);

    const boxes = rows.map((row: any) => {
      const box = Array.isArray(row.boxes) ? row.boxes[0] : row.boxes;
      const seriesNumbers = [
        ...new Set(
          (row.dispatch_items || [])
            .map((it: { series?: { serial_number?: string | null } | null }) =>
              String(it.series?.serial_number || '')
                .trim()
                .toUpperCase()
            )
            .filter(Boolean)
        ),
      ];
      return {
        dispatch_id: row.id as string,
        box_id: (box?.id ?? row.box_id ?? null) as string | null,
        box_code: (box?.box_code ?? null) as string | null,
        brand_id: (box?.brand_id ?? null) as string | null,
        model_id: (box?.model_id ?? null) as string | null,
        material: (box?.material ?? null) as string | null,
        valuation: (box?.valuation ?? null) as string | null,
        capacity: (box?.capacity ?? null) as number | null,
        status: (box?.status ?? null) as string | null,
        equipos_count: countEquiposByOs(row.dispatch_items),
        dispatched_at: row.dispatched_at as string | null,
        series_numbers: seriesNumbers,
        series_preview: seriesNumbers.slice(0, 5),
      };
    });

    const primary = rows[0] as any;
    const latest = rows.reduce((best: any, r: any) => {
      const t = r.dispatched_at || '';
      return !best || String(t) > String(best.dispatched_at || '') ? r : best;
    }, primary);

    const equiposTotal = boxes.reduce((sum, b) => sum + Number(b.equipos_count || 0), 0);
    const dispatchedBy = latest.dispatched_by as string | null;

    const responseBody = {
      guide_number: guide,
      notes: latest.notes ?? primary.notes ?? null,
      dispatch_type: latest.dispatch_type ?? primary.dispatch_type ?? null,
      dispatched_at: latest.dispatched_at ?? primary.dispatched_at ?? null,
      dispatched_by: dispatchedBy,
      dispatched_by_name: (dispatchedBy && names[dispatchedBy]) || 'Sistema',
      box_count: boxes.length,
      equipos_total: equiposTotal,
      boxes,
    };

    logEgress({
      route,
      module: 'despacho',
      action: 'history_by_guide',
      correlationId,
      rowCount: boxes.length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody);
  },
  { module: 'despacho', action: 'history_by_guide', roles: ROLES_BODEGA_DESPACHO }
);

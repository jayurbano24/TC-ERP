import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { assertBatchLimit } from '@/shared/infrastructure/http/batchLimit';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';

const SERIES_IN_BOX_SELECT =
  'id, serial_number, service_order_id, current_status, brand_id, model_id, material, valuation, updated_at, created_at';

const SIBLING_SELECT =
  'id, serial_number, service_order_id, material, valuation, created_at';

function coalesceMaterialLote(
  rows: Array<{ material?: string | null; valuation?: string | null }>
): { material: string; valuation: string } {
  let material = '';
  let valuation = '';
  for (const s of rows) {
    const m = String(s.material ?? '').trim();
    const v = String(s.valuation ?? '').trim();
    if (!material && m) material = m;
    if (!valuation && v) valuation = v;
    if (material && valuation) break;
  }
  return { material, valuation };
}

type RouteContext = { params: Promise<{ boxId: string }> };

export const GET = withErrorHandler(
  async (req: Request, context: RouteContext) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/despacho/boxes/[boxId]/items';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;
    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    const { boxId } = await context.params;
    if (!z.string().uuid().safeParse(boxId).success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', detail: 'boxId UUID inválido' }, { status: 400 });
    }

    const { data: inBox, error: boxError } = await supabase
      .from('series')
      .select(SERIES_IN_BOX_SELECT)
      .eq('current_box_id', boxId)
      .order('updated_at', { ascending: false });

    if (boxError) {
      return NextResponse.json({ error: 'QUERY_FAILED', detail: boxError.message }, { status: 500 });
    }

    const rows = inBox ?? [];
    const osIds = [...new Set(rows.map((r) => r.service_order_id).filter(Boolean))] as string[];
    assertBatchLimit(osIds, 80, 'service_order_id');

    let siblings: typeof rows = [];
    if (osIds.length > 0) {
      const { data: sibData, error: sibError } = await supabase
        .from('series')
        .select(SIBLING_SELECT)
        .in('service_order_id', osIds)
        .order('created_at', { ascending: true });
      if (sibError) {
        return NextResponse.json({ error: 'QUERY_FAILED', detail: sibError.message }, { status: 500 });
      }
      siblings = sibData ?? [];
    }

    const siblingsByOs = new Map<string, typeof siblings>();
    for (const s of siblings) {
      const key = String(s.service_order_id);
      if (!siblingsByOs.has(key)) siblingsByOs.set(key, []);
      siblingsByOs.get(key)!.push(s);
    }

    const enriched: Array<Record<string, unknown>> = [];
    const processedOs = new Set<string>();

    for (const item of rows) {
      const osId = item.service_order_id ? String(item.service_order_id) : null;
      if (osId && processedOs.has(osId)) continue;

      if (osId) {
        processedOs.add(osId);
        const sibs = siblingsByOs.get(osId) ?? [item];
        const { material, valuation } = coalesceMaterialLote(sibs);
        // Preferir como S1 la serie que tenga Material o Lote (datos SAP)
        const withMat =
          sibs.find((s) => String(s.material ?? '').trim() || String(s.valuation ?? '').trim()) ??
          sibs[0] ??
          item;
        const mainSn = withMat.serial_number;
        const ordered = [withMat, ...sibs.filter((s) => s.serial_number !== mainSn)];

        enriched.push({
          ...item,
          id: ordered[0]?.id ?? item.id,
          s1: ordered[0]?.serial_number ?? item.serial_number,
          s2: ordered[1]?.serial_number ?? '',
          s3: ordered[2]?.serial_number ?? '',
          s4: ordered[3]?.serial_number ?? '',
          material,
          valuation,
        });
      } else {
        enriched.push({
          ...item,
          s1: item.serial_number,
          s2: '',
          s3: '',
          s4: '',
        });
      }
    }

    const responseBody = { items: enriched };
    logEgress({
      route,
      module: 'despacho',
      action: 'box_items',
      correlationId,
      rowCount: enriched.length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody);
  },
  { module: 'despacho', action: 'box_items', roles: ROLES_BODEGA_DESPACHO }
);

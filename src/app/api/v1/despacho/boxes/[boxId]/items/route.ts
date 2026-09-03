import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { assertBatchLimit } from '@/shared/infrastructure/http/batchLimit';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';
import {
  buildEquipmentSerialSlots,
  coalesceMaterialLote,
} from '@/lib/sap/equipmentSerialSlots';

const SERIES_IN_BOX_SELECT =
  'id, serial_number, service_order_id, current_status, brand_id, model_id, material, valuation, sap_status, updated_at, created_at';

const SIBLING_SELECT =
  'id, serial_number, service_order_id, material, valuation, sap_status, created_at';

type Sib = {
  id: string;
  serial_number: string;
  service_order_id?: string | null;
  material?: string | null;
  valuation?: string | null;
  sap_status?: string | null;
  created_at?: string | null;
};

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

    let siblings: Sib[] = [];
    const mainByOs = new Map<string, string>();

    if (osIds.length > 0) {
      const [{ data: sibData, error: sibError }, { data: osData }] = await Promise.all([
        supabase
          .from('series')
          .select(SIBLING_SELECT)
          .in('service_order_id', osIds)
          .order('created_at', { ascending: true }),
        supabase.from('service_orders').select('id, main_serial').in('id', osIds),
      ]);
      if (sibError) {
        return NextResponse.json({ error: 'QUERY_FAILED', detail: sibError.message }, { status: 500 });
      }
      siblings = (sibData ?? []) as Sib[];
      for (const os of osData ?? []) {
        if (os.main_serial) mainByOs.set(String(os.id), String(os.main_serial));
      }
    }

    const siblingsByOs = new Map<string, Sib[]>();
    for (const s of siblings) {
      const key = String(s.service_order_id);
      if (!siblingsByOs.has(key)) siblingsByOs.set(key, []);
      siblingsByOs.get(key)!.push(s);
    }

    const enriched: Array<Record<string, unknown>> = [];
    const processedOs = new Set<string>();
    const osInBox = new Set(
      rows.map((r) => (r.service_order_id ? String(r.service_order_id) : null)).filter(Boolean) as string[]
    );

    for (const item of rows) {
      const osId = item.service_order_id ? String(item.service_order_id) : null;
      if (osId && processedOs.has(osId)) continue;

      if (!osId) {
        let siblingOfOsInBox = false;
        for (const oid of osInBox) {
          const sibs = siblingsByOs.get(oid) ?? [];
          if (sibs.some((s) => s.id === item.id)) {
            siblingOfOsInBox = true;
            break;
          }
        }
        if (siblingOfOsInBox) continue;
      }

      if (osId) {
        processedOs.add(osId);
        const sibs = siblingsByOs.get(osId) ?? [item as Sib];
        const { material, valuation } = coalesceMaterialLote(sibs);
        const slots = buildEquipmentSerialSlots(
          sibs.map((s) => ({
            id: String(s.id),
            serial_number: s.serial_number,
            material: s.material,
            valuation: s.valuation,
            sap_status: s.sap_status,
            created_at: s.created_at,
          })),
          mainByOs.get(osId)
        );

        enriched.push({
          ...item,
          id: slots.primary.id,
          s1: slots.s1,
          s2: slots.s2,
          s3: slots.s3,
          s4: slots.s4,
          serial_number: slots.s1 || item.serial_number,
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
          material: item.material ?? '',
          valuation: item.valuation ?? '',
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

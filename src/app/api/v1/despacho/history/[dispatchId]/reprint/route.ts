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

const SIBLING_SELECT =
  'id, serial_number, service_order_id, material, valuation, sap_status, brand_id, model_id, created_at';

type Sib = {
  id: string;
  serial_number: string;
  service_order_id?: string | null;
  material?: string | null;
  valuation?: string | null;
  sap_status?: string | null;
  brand_id?: string | null;
  model_id?: string | null;
  created_at?: string | null;
};

type RouteContext = { params: Promise<{ dispatchId: string }> };

export const GET = withErrorHandler(
  async (req: Request, context: RouteContext) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/despacho/history/[dispatchId]/reprint';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;
    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    const { dispatchId } = await context.params;
    if (!z.string().uuid().safeParse(dispatchId).success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', detail: 'dispatchId UUID inválido' }, { status: 400 });
    }

    const { data: dispatch, error: dErr } = await supabase
      .from('dispatches')
      .select(
        `
        id,
        guide_number,
        notes,
        dispatched_at,
        box_id,
        boxes:box_id (
          id,
          box_code,
          brand_id,
          model_id,
          material,
          valuation,
          capacity
        ),
        dispatch_items (
          series_id,
          series:series_id (
            id,
            serial_number,
            service_order_id,
            material,
            valuation,
            brand_id,
            model_id,
            created_at
          )
        )
      `
      )
      .eq('id', dispatchId)
      .maybeSingle();

    if (dErr) {
      return NextResponse.json({ error: 'QUERY_FAILED', detail: dErr.message }, { status: 500 });
    }
    if (!dispatch) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    const box = Array.isArray((dispatch as any).boxes)
      ? (dispatch as any).boxes[0]
      : (dispatch as any).boxes;

    const itemSeries = ((dispatch as any).dispatch_items ?? [])
      .map((di: any) => di.series)
      .filter(Boolean) as Sib[];

    const osIds = [...new Set(itemSeries.map((s) => s.service_order_id).filter(Boolean))] as string[];
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

    for (const item of itemSeries) {
      const osId = item.service_order_id ? String(item.service_order_id) : null;
      if (osId && processedOs.has(osId)) continue;

      let sibs: Sib[] = osId ? siblingsByOs.get(osId) ?? [item] : [item];
      if (!sibs.length) sibs = [item];

      const slots = buildEquipmentSerialSlots(
        sibs.map((s) => ({
          id: String(s.id),
          serial_number: s.serial_number,
          material: s.material,
          valuation: s.valuation,
          sap_status: s.sap_status,
          created_at: s.created_at,
        })),
        osId ? mainByOs.get(osId) : null
      );
      const { material, valuation } = coalesceMaterialLote(sibs);
      const primary = sibs.find((s) => String(s.id) === slots.primary.id) ?? sibs[0]!;

      enriched.push({
        id: primary.id,
        serial_number: slots.s1 || primary.serial_number,
        s1: slots.s1,
        s2: slots.s2,
        s3: slots.s3,
        s4: slots.s4,
        material,
        valuation,
        brand_id: primary.brand_id ?? item.brand_id,
        model_id: primary.model_id ?? item.model_id,
        service_order_id: osId,
      });

      if (osId) processedOs.add(osId);
    }

    const notes = String(dispatch.notes || '');
    const sapMatch = notes.match(/SAP:\s*([^·]+)/i);
    const neMatch = notes.match(/NE:\s*([^·]+)/i);
    const destino = notes.split('·')[0]?.trim() || notes.trim() || null;

    const responseBody = {
      dispatch: {
        id: dispatch.id,
        guide_number: dispatch.guide_number,
        notes: dispatch.notes,
        dispatched_at: dispatch.dispatched_at,
        traslado_sap: sapMatch?.[1]?.trim() || null,
        nota_entrega: neMatch?.[1]?.trim() || null,
        destino,
      },
      box: box
        ? {
            id: box.id,
            box_code: box.box_code,
            brand_id: box.brand_id,
            model_id: box.model_id,
            material: box.material,
            valuation: box.valuation,
            capacity: box.capacity,
          }
        : null,
      items: enriched,
      equipos_count: enriched.length,
    };

    logEgress({
      route,
      module: 'despacho',
      action: 'history_reprint',
      correlationId,
      rowCount: enriched.length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody);
  },
  { module: 'despacho', action: 'history_reprint', roles: ROLES_BODEGA_DESPACHO }
);

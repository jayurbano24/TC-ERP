import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logOnlyRoleCheck, ROLES_RETURNS_SAP } from '@/shared/authz/roleGuard';
import { isSapIntegrationStatus } from '@/lib/sap/sapDashboardStates';
import type { SapValidationState } from '@/modules/sap-integration/domain/sap-validation-status';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_EXPORT_OS = 5_000;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

type SeriesRow = {
  id: string;
  serial_number: string;
  material: string | null;
  valuation: string | null;
  sap_status: string | null;
  current_status: string | null;
  current_box_id: string | null;
  service_order_id: string | null;
};

function statusLabel(raw: string | null | undefined): string {
  const s = String(raw || '').toLowerCase();
  if (s === 'in_central_warehouse' || s.includes('bodega_genera') || s.includes('recepcionado')) {
    return 'Bodega Central';
  }
  if (s === 'in_control_warehouse') return 'Bodega Control';
  if (s === 'in_dispatch_warehouse') return 'Bodega Despacho';
  if (s === 'in_workshop' || s.includes('diagn')) return 'Taller';
  if (s === 'in_repair') return 'Reparación';
  if (s === 'in_qc') return 'Control Calidad';
  if (s === 'ready_to_dispatch') return 'Listo despacho';
  if (s === 'dispatched') return 'Despachado';
  if (s === 'irreparable') return 'SCRAP';
  return raw || '—';
}

async function loadBoxCodes(boxIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const db = getSupabaseServerClient();
  for (let i = 0; i < boxIds.length; i += 80) {
    const chunk = boxIds.slice(i, i + 80);
    const { data } = await db.from('boxes').select('id, box_code').in('id', chunk);
    for (const b of data || []) {
      map.set(String(b.id), String(b.box_code || ''));
    }
  }
  return map;
}

async function fetchOrdersEnPlanta(status: SapValidationState, limit: number, offset: number) {
  const db = getSupabaseServerClient();
  const { data, error } = await db.rpc('fetch_os_sap_status_en_planta', {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  const rows = (data || []) as Array<Record<string, unknown>>;
  const total = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
  const orders = rows.map((row) => {
    const { total_count: _totalCount, ...order } = row;
    return order;
  });
  return { orders, total };
}

async function enrichWithSeries(orders: Array<Record<string, unknown>>) {
  if (orders.length === 0) return [];

  const osIds = orders.map((o) => String(o.id));
  const seriesByOs = new Map<string, SeriesRow[]>();
  const db = getSupabaseServerClient();

  for (let i = 0; i < osIds.length; i += 80) {
    const chunk = osIds.slice(i, i + 80);
    const { data: ser, error: se } = await db
      .from('series')
      .select(
        'id, serial_number, material, valuation, sap_status, current_status, current_box_id, service_order_id',
      )
      .in('service_order_id', chunk);
    if (se) throw new Error(se.message);
    for (const s of ser || []) {
      const oid = String(s.service_order_id || '');
      if (!oid) continue;
      const row: SeriesRow = {
        id: String(s.id),
        serial_number: String(s.serial_number || ''),
        material: s.material ?? null,
        valuation: s.valuation ?? null,
        sap_status: s.sap_status ?? null,
        current_status: s.current_status ?? null,
        current_box_id: s.current_box_id ?? null,
        service_order_id: oid,
      };
      if (!seriesByOs.has(oid)) seriesByOs.set(oid, []);
      seriesByOs.get(oid)!.push(row);
    }
  }

  const allSeries = [...seriesByOs.values()].flat();
  const boxIds = [
    ...new Set(allSeries.map((s) => s.current_box_id).filter(Boolean)),
  ] as string[];
  const boxCodeById = await loadBoxCodes(boxIds);

  return orders.map((o) => {
      const oid = String(o.id);
      const series = (seriesByOs.get(oid) || []).map((s) => ({
        ...s,
        box_code: s.current_box_id ? boxCodeById.get(s.current_box_id) || null : null,
        ubicacion: statusLabel(s.current_status),
      }));
      const materials = [
        ...new Set(series.map((s) => String(s.material || '').trim()).filter(Boolean)),
      ].sort();
      const primary = series[0];
      return {
        id: oid,
        os_label: (o.os_label as string | null) ?? null,
        main_serial: (o.main_serial as string | null) ?? null,
        os_status: (o.status as string | null) ?? null,
        last_sap_sync: (o.last_sap_sync as string | null) ?? null,
        materials,
        material_count: materials.length,
        ubicacion: primary?.ubicacion ?? '—',
        series_count: series.length,
        series,
      };
    });
}

function excelResponse(status: SapValidationState, rows: Awaited<ReturnType<typeof enrichWithSeries>>) {
  const flat = rows.flatMap((eq) =>
    eq.series.length > 0
      ? eq.series.map((s) => ({
          OS: eq.os_label || '—',
          'Serie principal': eq.main_serial || '—',
          Serie: s.serial_number,
          Material: s.material || '—',
          Valoración: s.valuation || '—',
          'Estado SAP serie': s.sap_status || '—',
          Ubicación: s.ubicacion || '—',
          Caja: s.box_code || '—',
          'Estado TC': s.current_status || '—',
          'Último sync SAP': eq.last_sap_sync || '—',
        }))
      : [
          {
            OS: eq.os_label || '—',
            'Serie principal': eq.main_serial || '—',
            Serie: '—',
            Material: '—',
            Valoración: '—',
            'Estado SAP serie': status,
            Ubicación: eq.ubicacion || '—',
            Caja: '—',
            'Estado TC': eq.os_status || '—',
            'Último sync SAP': eq.last_sap_sync || '—',
          },
        ],
  );

  const ws = XLSX.utils.json_to_sheet(flat);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, status.slice(0, 28));
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = status.replace(/\s+/g, '-').toLowerCase();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="sap-${slug}-${stamp}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Listado paginado de OS por sap_integration_status (5 estados reales).
 * Solo OS en planta — excluye despachadas (misma base que tarjetas SAP).
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof NextResponse) return auth;

  const denied = await logOnlyRoleCheck(request, ROLES_RETURNS_SAP, {
    module: 'sap',
    action: 'os_by_status_list',
  });
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status') || '';
  if (!isSapIntegrationStatus(statusParam)) {
    return NextResponse.json(
      { success: false, error: 'Parámetro status inválido (5 estados SAP).' },
      { status: 400 },
    );
  }
  const status = statusParam as SapValidationState;
  const format = (searchParams.get('format') || 'json').toLowerCase();

  try {
    if (format === 'xlsx') {
      const { orders } = await fetchOrdersEnPlanta(status, MAX_EXPORT_OS, 0);
      const data = await enrichWithSeries(orders);
      return excelResponse(status, data);
    }

    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE)),
    );
    const offset = (page - 1) * pageSize;

    const { orders, total } = await fetchOrdersEnPlanta(status, pageSize, offset);
    const data = await enrichWithSeries(orders);

    return NextResponse.json({
      success: true,
      status,
      page,
      pageSize,
      total,
      count: data.length,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

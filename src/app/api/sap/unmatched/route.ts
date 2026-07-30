import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logOnlyRoleCheck, ROLES_RETURNS_SAP } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type SeriesRow = {
  id: string;
  serial_number: string;
  sap_status: string | null;
  current_status: string | null;
  current_box_id: string | null;
  service_order_id: string | null;
  material: string | null;
  valuation: string | null;
};

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function statusLabel(raw: string | null | undefined): string {
  const s = String(raw || '').toLowerCase();
  if (s === 'in_central_warehouse') return 'Bodega Central';
  if (s === 'in_control_warehouse') return 'Bodega Control';
  if (s === 'in_workshop' || s.includes('diagn')) return 'Taller';
  if (s === 'in_repair') return 'Reparación';
  if (s === 'in_qc') return 'Control Calidad';
  if (s === 'ready_to_dispatch') return 'Listo despacho';
  if (s === 'dispatched') return 'Despachado';
  if (s === 'irreparable') return 'SCRAP';
  return raw || '—';
}

/**
 * Lista series / OS marcadas Sin Coincidencia tras el último sync SAP,
 * con caja, rack y estatus de ubicación.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof NextResponse) return auth;

  const denied = await logOnlyRoleCheck(request, ROLES_RETURNS_SAP, {
    module: 'sap',
    action: 'unmatched_export',
  });
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') || 'csv').toLowerCase();
  const db = getSupabaseServerClient();

  const pageSize = 1000;
  const series: SeriesRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('series')
      .select(
        'id, serial_number, sap_status, current_status, current_box_id, service_order_id, material, valuation'
      )
      .eq('sap_status', 'Sin Coincidencia')
      .not('service_order_id', 'is', null)
      .order('serial_number', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    const chunk = (data || []) as SeriesRow[];
    series.push(...chunk);
    if (chunk.length < pageSize) break;
    if (series.length >= 80_000) break;
  }

  const osIds = [...new Set(series.map((s) => s.service_order_id).filter(Boolean))] as string[];
  const boxIds = [...new Set(series.map((s) => s.current_box_id).filter(Boolean))] as string[];

  const osById = new Map<string, { os_label: string | null; sap_integration_status: string | null }>();
  for (let i = 0; i < osIds.length; i += 200) {
    const chunk = osIds.slice(i, i + 200);
    const { data } = await db
      .from('service_orders')
      .select('id, os_label, sap_integration_status')
      .in('id', chunk);
    for (const row of data || []) {
      osById.set(String(row.id), {
        os_label: row.os_label ?? null,
        sap_integration_status: row.sap_integration_status ?? null,
      });
    }
  }

  const boxById = new Map<string, { box_code: string | null; rack_location: string | null }>();
  for (let i = 0; i < boxIds.length; i += 200) {
    const chunk = boxIds.slice(i, i + 200);
    const { data } = await db
      .from('boxes')
      .select('id, box_code, rack_location')
      .in('id', chunk);
    for (const row of data || []) {
      boxById.set(String(row.id), {
        box_code: row.box_code ?? null,
        rack_location: row.rack_location ?? null,
      });
    }
  }

  const rows = series.map((s) => {
    const os = s.service_order_id ? osById.get(s.service_order_id) : undefined;
    const box = s.current_box_id ? boxById.get(s.current_box_id) : undefined;
    return {
      serie: s.serial_number,
      os: os?.os_label || '—',
      sap_serie: s.sap_status || '—',
      sap_equipo: os?.sap_integration_status || '—',
      ubicacion_estatus: statusLabel(s.current_status),
      caja: box?.box_code || '—',
      rack: box?.rack_location || '—',
      material: s.material || '—',
      valoracion: s.valuation || '—',
    };
  });

  if (format === 'json') {
    return NextResponse.json({
      success: true,
      count: rows.length,
      equiposApprox: osIds.length,
      data: rows,
    });
  }

  const header = [
    'Serie',
    'OS',
    'SAP Serie',
    'SAP Equipo',
    'Ubicación / Estatus',
    'Caja',
    'Rack',
    'Material',
    'Valoración',
  ];
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        r.serie,
        r.os,
        r.sap_serie,
        r.sap_equipo,
        r.ubicacion_estatus,
        r.caja,
        r.rack,
        r.material,
        r.valoracion,
      ]
        .map(csvEscape)
        .join(',')
    ),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sap-sin-coincidencia-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

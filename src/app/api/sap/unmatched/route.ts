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
  if (s === 'in_central_warehouse' || s.includes('bodega_genera') || s.includes('recepcionado')) {
    return 'Bodega Central';
  }
  if (s === 'in_control_warehouse') return 'Bodega Control';
  if (s === 'in_workshop' || s.includes('diagn')) return 'Taller';
  if (s === 'in_repair') return 'Reparacion';
  if (s === 'in_qc') return 'Control Calidad';
  if (s === 'ready_to_dispatch') return 'Listo despacho';
  if (s === 'dispatched') return 'Despachado';
  if (s === 'irreparable') return 'SCRAP';
  return raw || '-';
}

/**
 * Exporta series de equipos (OS) con sap_integration_status = Sin Coincidencia.
 * Incluye todas las series del OS (S1–S4) para ver si el G985 debió cruzar alguna.
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

  // 1) OS realmente sin match (no hermanas de OS ya validados)
  const unmatchedOsIds: string[] = [];
  const osMeta = new Map<string, { os_label: string | null; sap_integration_status: string | null }>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('service_orders')
      .select('id, os_label, sap_integration_status')
      .eq('sap_integration_status', 'Sin Coincidencia')
      .order('os_label', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    const chunk = data || [];
    for (const row of chunk) {
      unmatchedOsIds.push(String(row.id));
      osMeta.set(String(row.id), {
        os_label: row.os_label ?? null,
        sap_integration_status: row.sap_integration_status ?? null,
      });
    }
    if (chunk.length < pageSize) break;
  }

  if (unmatchedOsIds.length === 0) {
    if (format === 'json') {
      return NextResponse.json({ success: true, count: 0, equipos: 0, data: [] });
    }
    const bom = '\uFEFF';
    return new NextResponse(bom + 'Serie,OS,SAP Serie,SAP Equipo,Ubicacion,Caja,Rack,Material,Valoracion\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="sap-sin-coincidencia.csv"',
      },
    });
  }

  // 2) Todas las series de esos OS
  const series: SeriesRow[] = [];
  for (let i = 0; i < unmatchedOsIds.length; i += 150) {
    const osChunk = unmatchedOsIds.slice(i, i + 150);
    let from = 0;
    for (;;) {
      const { data, error } = await db
        .from('series')
        .select(
          'id, serial_number, sap_status, current_status, current_box_id, service_order_id, material, valuation'
        )
        .in('service_order_id', osChunk)
        .order('serial_number', { ascending: true })
        .range(from, from + 999);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      const chunk = (data || []) as SeriesRow[];
      series.push(...chunk);
      if (chunk.length < 1000) break;
      from += 1000;
    }
  }

  const boxIds = [...new Set(series.map((s) => s.current_box_id).filter(Boolean))] as string[];
  const boxById = new Map<string, { box_code: string | null; rack_location: string | null }>();
  for (let i = 0; i < boxIds.length; i += 200) {
    const chunk = boxIds.slice(i, i + 200);
    const { data } = await db.from('boxes').select('id, box_code, rack_location').in('id', chunk);
    for (const row of data || []) {
      boxById.set(String(row.id), {
        box_code: row.box_code ?? null,
        rack_location: row.rack_location ?? null,
      });
    }
  }

  const rows = series.map((s) => {
    const os = s.service_order_id ? osMeta.get(s.service_order_id) : undefined;
    const box = s.current_box_id ? boxById.get(s.current_box_id) : undefined;
    return {
      serie: s.serial_number,
      os: os?.os_label || '-',
      sap_serie: s.sap_status || '-',
      sap_equipo: os?.sap_integration_status || '-',
      ubicacion: statusLabel(s.current_status),
      caja: box?.box_code || '-',
      rack: box?.rack_location || '-',
      material: s.material || '-',
      valoracion: s.valuation || '-',
    };
  });

  if (format === 'json') {
    return NextResponse.json({
      success: true,
      count: rows.length,
      equipos: unmatchedOsIds.length,
      data: rows,
    });
  }

  const header = [
    'Serie',
    'OS',
    'SAP Serie',
    'SAP Equipo',
    'Ubicacion',
    'Caja',
    'Rack',
    'Material',
    'Valoracion',
  ];
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [r.serie, r.os, r.sap_serie, r.sap_equipo, r.ubicacion, r.caja, r.rack, r.material, r.valoracion]
        .map(csvEscape)
        .join(',')
    ),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  // BOM para que Excel abra acentos correctamente
  const body = `\uFEFF${lines.join('\n')}`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sap-sin-coincidencia-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

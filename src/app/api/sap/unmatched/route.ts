import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logOnlyRoleCheck, ROLES_RETURNS_SAP } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type ExportRow = {
  serie: string;
  os: string;
  sap_serie: string;
  sap_equipo: string;
  ubicacion: string;
  caja: string;
  rack: string;
  material: string;
  valoracion: string;
};

function toExcelRow(row: ExportRow) {
  return {
    Serie: row.serie,
    OS: row.os,
    'SAP Serie': row.sap_serie,
    'SAP Equipo': row.sap_equipo,
    Ubicación: row.ubicacion,
    Caja: row.caja,
    Rack: row.rack,
    Material: row.material,
    Valoración: row.valoracion,
  };
}

function excelResponse(rows: ExportRow[], equipos: number) {
  const stamp = new Date().toISOString().slice(0, 10);
  const ws = XLSX.utils.json_to_sheet(rows.map(toExcelRow));
  ws['!cols'] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 16 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sin coincidencia');
  const summary = XLSX.utils.json_to_sheet([
    {
      Equipos: equipos,
      Series: rows.length,
      Criterio: 'OS activas en TC con serie, sin match en SAP validado. Excluye despachadas.',
    },
  ]);
  summary['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(wb, summary, 'Resumen');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="sap-sin-coincidencia-${stamp}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}

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
  return raw || '-';
}

/**
 * Exporta series de OS activas con sap_integration_status = Sin Coincidencia.
 * Una OS que ya tiene una serie despachada queda fuera: después del despacho es
 * correcto que desaparezca del inventario SAP.
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
  const format = (searchParams.get('format') || 'xlsx').toLowerCase();
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
    return excelResponse([], 0);
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

  // Defensa adicional para datos previos a la migración: aunque una OS conserve
  // temporalmente "Sin Coincidencia", nunca se exporta si ya fue despachada.
  const dispatchedOsIds = new Set(
    series
      .filter((s) => s.current_status === 'dispatched' && s.service_order_id)
      .map((s) => s.service_order_id as string)
  );
  const activeSeries = series.filter(
    (s) => !s.service_order_id || !dispatchedOsIds.has(s.service_order_id)
  );
  const activeUnmatchedOsIds = unmatchedOsIds.filter((id) => !dispatchedOsIds.has(id));

  const boxIds = [
    ...new Set(activeSeries.map((s) => s.current_box_id).filter(Boolean)),
  ] as string[];
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

  const rows: ExportRow[] = activeSeries.map((s) => {
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
      equipos: activeUnmatchedOsIds.length,
      data: rows,
    });
  }

  return excelResponse(rows, activeUnmatchedOsIds.length);
}

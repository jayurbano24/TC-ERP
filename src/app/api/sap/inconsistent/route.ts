import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logOnlyRoleCheck, ROLES_RETURNS_SAP } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SeriesRow = {
  id: string;
  serial_number: string;
  material: string | null;
  valuation: string | null;
  sap_status: string | null;
  current_status: string | null;
  current_box_id: string | null;
};

/**
 * Equipos (OS) con sap_integration_status = Pendiente Revisión:
 * mismo equipo cruzó el G985 con 2+ materiales distintos en sus series.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof NextResponse) return auth;

  const denied = await logOnlyRoleCheck(request, ROLES_RETURNS_SAP, {
    module: 'sap',
    action: 'inconsistent_list',
  });
  if (denied) return denied;

  const db = getSupabaseServerClient();

  const { data: osRows, error: osErr } = await db
    .from('service_orders')
    .select('id, os_label, main_serial, sap_integration_status, last_sap_sync, status')
    .eq('sap_integration_status', 'Pendiente Revisión')
    .order('os_label', { ascending: true })
    .limit(500);

  if (osErr) {
    return NextResponse.json({ success: false, error: osErr.message }, { status: 500 });
  }

  const orders = osRows || [];
  if (orders.length === 0) {
    return NextResponse.json({ success: true, data: [], count: 0 });
  }

  const osIds = orders.map((o) => String(o.id));
  const seriesByOs = new Map<string, SeriesRow[]>();
  const boxIds = new Set<string>();

  for (let i = 0; i < osIds.length; i += 80) {
    const chunk = osIds.slice(i, i + 80);
    const { data: ser, error: se } = await db
      .from('series')
      .select(
        'id, serial_number, material, valuation, sap_status, current_status, current_box_id, service_order_id',
      )
      .in('service_order_id', chunk);
    if (se) {
      return NextResponse.json({ success: false, error: se.message }, { status: 500 });
    }
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
      };
      if (!seriesByOs.has(oid)) seriesByOs.set(oid, []);
      seriesByOs.get(oid)!.push(row);
      if (row.current_box_id) boxIds.add(row.current_box_id);
    }
  }

  const boxCodeById = new Map<string, string>();
  const boxIdList = [...boxIds];
  for (let i = 0; i < boxIdList.length; i += 80) {
    const chunk = boxIdList.slice(i, i + 80);
    const { data: boxes } = await db.from('boxes').select('id, box_code').in('id', chunk);
    for (const b of boxes || []) {
      boxCodeById.set(String(b.id), String(b.box_code || ''));
    }
  }

  const data = orders.map((o) => {
    const series = (seriesByOs.get(String(o.id)) || []).map((s) => ({
      ...s,
      box_code: s.current_box_id ? boxCodeById.get(s.current_box_id) || null : null,
    }));
    const materials = [
      ...new Set(
        series
          .map((s) => String(s.material || '').trim())
          .filter(Boolean),
      ),
    ].sort();
    return {
      id: String(o.id),
      os_label: o.os_label ?? null,
      main_serial: o.main_serial ?? null,
      os_status: o.status ?? null,
      last_sap_sync: o.last_sap_sync ?? null,
      materials,
      material_count: materials.length,
      series,
    };
  });

  return NextResponse.json({
    success: true,
    count: data.length,
    data,
  });
}

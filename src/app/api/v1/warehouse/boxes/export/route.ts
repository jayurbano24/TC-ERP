import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import {
  enrichWarehouseBoxItems,
  type EnrichedWarehouseBoxRow,
  type WarehouseBoxListRow,
} from '@/shared/infrastructure/warehouse/enrichWarehouseBoxItems';
import { isBodegaOperationalRack } from '@/lib/database/warehouse';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { resolveWarehouseBoxOperationalStatus } from '@/modules/inventario/domain/warehouseBoxStatus';

export const maxDuration = 60;

const PAGE_SIZE = 200;
const MAX_PAGES = 50; // tope de seguridad (~10k cajas)

function onlyBodegaRows<T extends { rack?: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => isBodegaOperationalRack(row.rack));
}

function parseRackParts(rackLocation: string | null | undefined): {
  ubicacion: string;
  rack: string;
  nivel: string;
  posicion: string;
} {
  const raw = String(rackLocation || '').trim();
  const isSinRack = !raw || raw.toUpperCase() === 'SIN RACK';
  if (isSinRack) {
    return { ubicacion: 'SIN RACK', rack: '', nivel: '', posicion: '' };
  }
  const parts = raw.split(' - ');
  return {
    ubicacion: raw,
    rack: parts[0]?.replace(/^RACK-/i, '') || raw,
    nivel: parts[1]?.replace(/^NIVEL-/i, '') || '',
    posicion: parts[2]?.replace(/^POSICION-/i, '') || '',
  };
}

function toExcelRow(box: EnrichedWarehouseBoxRow) {
  const { ubicacion, rack, nivel, posicion } = parseRackParts(box.rack);
  const units = Number(box.equipos_count ?? box.series_count ?? 0);
  const capacity = Number(box.capacity || 0);
  const operationalStatus = resolveWarehouseBoxOperationalStatus({
    units,
    capacity,
    boxStatus: box.box_status,
    isPartialBox: box.is_partial_box,
    partialReason: box.partial_box_reason,
  });
  const createdAt = box.created_at ? new Date(box.created_at).toLocaleString('es-GT') : '';

  return {
    'ID Caja': box.box_id,
    'Código Caja': box.label || '',
    'Fecha Ingreso': createdAt,
    Tecnología: box.tech_name || '---',
    Marca: box.brand_name || 'N/A',
    Modelo: box.model_name || 'N/A',
    Ubicación: ubicacion,
    Rack: rack,
    Nivel: nivel,
    Posición: posicion,
    Área: 'Bodega Central',
    Unidades: units,
    Capacidad: capacity,
    Diferencia: operationalStatus.difference,
    Estatus: operationalStatus.status,
    'Motivo / trazabilidad': operationalStatus.reason,
    'Usuario Ingreso': box.ingreso_user_name || 'SISTEMA',
  };
}

async function fetchAllBodegaBoxes(supabase: SupabaseClient): Promise<WarehouseBoxListRow[]> {
  const all: WarehouseBoxListRow[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let pageRows: WarehouseBoxListRow[] = [];
    const primary = await supabase.rpc('warehouse_list_boxes_page', {
      p_cursor: cursor,
      p_limit: PAGE_SIZE,
      p_search: null,
      p_fill_status: null,
    });

    let rpcError = primary.error;
    if (!rpcError) {
      pageRows = (primary.data ?? []) as WarehouseBoxListRow[];
    } else if (
      rpcError.message?.includes('warehouse_list_boxes_page') ||
      rpcError.code === 'PGRST202'
    ) {
      const legacy = await supabase.rpc('warehouse_list_boxes_page', {
        p_cursor: cursor,
        p_limit: PAGE_SIZE,
        p_search: null,
      });
      rpcError = legacy.error;
      if (!rpcError) {
        pageRows = (legacy.data ?? []) as WarehouseBoxListRow[];
      }
    }

    if (rpcError) {
      throw new Error(rpcError.message || 'QUERY_FAILED');
    }

    const rows = onlyBodegaRows(pageRows);
    if (rows.length === 0) break;

    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    cursor = rows[rows.length - 1]?.box_id ?? null;
    if (!cursor) break;
  }

  return all;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  const roleCheck = await logOnlyRoleCheck(req, ROLES_BODEGA_DESPACHO, {
    module: 'bodega',
    action: 'export_boxes',
  });
  if (roleCheck) return roleCheck;

  try {
    // Service role: misma lectura que listado/KPIs (evita RLS parcial y columna fantasma).
    const db = getSupabaseServerClient();
    const items = await fetchAllBodegaBoxes(db);
    const enriched = await enrichWarehouseBoxItems(db, items);
    const rows = enriched.map(toExcelRow);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No hay datos para exportar' }, { status: 404 });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 38 },
      { wch: 15 },
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 28 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 15 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 16 },
      { wch: 52 },
      { wch: 20 },
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle Cajas');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const today = new Date().toISOString().slice(0, 10);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Reporte_Detalle_Cajas_${today}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Export Error:', message, err);
    return NextResponse.json(
      { error: 'Error generando reporte', detail: message },
      { status: 500 }
    );
  }
}

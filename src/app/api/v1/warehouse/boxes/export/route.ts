import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import type { EnrichedWarehouseBoxRow } from '@/shared/infrastructure/warehouse/enrichWarehouseBoxItems';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { resolveWarehouseBoxOperationalStatus } from '@/modules/inventario/domain/warehouseBoxStatus';
import { formatWarehouseBoxId } from '@/modules/inventario/client/warehouseBoxDisplay';
import {
  fetchFilteredWarehouseBoxesForExport,
  fetchFilteredWarehouseSeriesForExport,
  WAREHOUSE_EXPORT_SERIES_BOXES_PER_PART,
  type WarehouseSeriesExportRow,
} from '@/modules/inventario/server/warehouseFilteredExport';

/** ETL cajas+series: fases internas de lectura → un solo Excel (2 hojas). */
export const maxDuration = 120;

const ExportQuery = z.object({
  search: z.string().trim().max(100).optional(),
  fillStatus: z.enum(['partial', 'full', 'all']).optional(),
  technologyId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
  /**
   * boxes = solo detalle cajas (xlsx)
   * series = una parte xlsx (legacy/paginado)
   * boxes-series-etl = cajas + series en un Excel (fases internas)
   */
  kind: z.enum(['boxes', 'series', 'boxes-series-etl', 'series-etl']).default('boxes'),
  boxOffset: z.coerce.number().int().min(0).default(0),
  boxLimit: z.coerce
    .number()
    .int()
    .min(1)
    .max(80)
    .default(WAREHOUSE_EXPORT_SERIES_BOXES_PER_PART),
});

const BOX_COLS = [
  { wch: 16 },
  { wch: 20 },
  { wch: 14 },
  { wch: 14 },
  { wch: 18 },
  { wch: 28 },
  { wch: 10 },
  { wch: 10 },
  { wch: 10 },
  { wch: 14 },
  { wch: 10 },
  { wch: 10 },
  { wch: 10 },
  { wch: 16 },
  { wch: 40 },
  { wch: 18 },
];

const SERIES_COLS = [
  { wch: 14 },
  { wch: 22 },
  { wch: 12 },
  { wch: 12 },
  { wch: 16 },
  { wch: 14 },
  { wch: 18 },
  { wch: 16 },
  { wch: 16 },
  { wch: 16 },
  { wch: 12 },
  { wch: 12 },
  { wch: 18 },
];

async function loadAllSeriesViaEtlPhases(
  db: Parameters<typeof fetchFilteredWarehouseSeriesForExport>[0],
  boxes: EnrichedWarehouseBoxRow[],
  filters: {
    search?: string;
    fillStatus?: 'partial' | 'full' | 'all' | null;
    technologyId?: string;
    modelId?: string;
  }
): Promise<{ rows: WarehouseSeriesExportRow[]; phases: number }> {
  const allRows: WarehouseSeriesExportRow[] = [];
  let offset = 0;
  let phases = 0;
  const maxPhases = 200;
  while (phases < maxPhases) {
    const page = await fetchFilteredWarehouseSeriesForExport(db, boxes, filters, {
      boxOffset: offset,
      boxLimit: WAREHOUSE_EXPORT_SERIES_BOXES_PER_PART,
    });
    phases += 1;
    allRows.push(...page.rows);
    if (page.done || page.nextBoxOffset == null) break;
    offset = page.nextBoxOffset;
  }
  return { rows: allRows, phases };
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

function toExcelBoxRow(box: EnrichedWarehouseBoxRow) {
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
  const code = formatWarehouseBoxId(box.label, box.box_id).primary;

  // Sin UUID en columnas operativas — el operador necesita BOX-XXXX / TCW-BOX-XXX.
  return {
    'Código Caja': code,
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

function xlsxResponse(
  wb: XLSX.WorkBook,
  filename: string,
  headers: Record<string, string>
): NextResponse {
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new NextResponse(buffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      ...headers,
    },
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  const roleCheck = await logOnlyRoleCheck(req, ROLES_BODEGA_DESPACHO, {
    module: 'bodega',
    action: 'export_boxes',
  });
  if (roleCheck) return roleCheck;

  const parsed = ExportQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { search, fillStatus, technologyId, modelId, kind, boxOffset, boxLimit } =
    parsed.data;
  const hasCatalogFilter = Boolean(technologyId || modelId);
  const today = new Date().toISOString().slice(0, 10);
  const filterTag = hasCatalogFilter ? '_filtrado' : '';

  try {
    const db = getSupabaseServerClient();
    const filters = {
      search,
      fillStatus: fillStatus ?? null,
      technologyId,
      modelId,
    };
    const boxes = await fetchFilteredWarehouseBoxesForExport(db, filters);

    if (boxes.length === 0) {
      return NextResponse.json(
        {
          error: 'No hay datos para exportar',
          detail: hasCatalogFilter
            ? 'Ninguna caja coincide con el filtro activo (tecnología / modelo / estatus).'
            : undefined,
        },
        { status: 404 }
      );
    }

    if (kind === 'boxes') {
      const boxRows = boxes.map(toExcelBoxRow);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(boxRows);
      ws['!cols'] = BOX_COLS;
      XLSX.utils.book_append_sheet(wb, ws, 'Detalle Cajas');
      const partsNeeded = Math.ceil(boxes.length / WAREHOUSE_EXPORT_SERIES_BOXES_PER_PART);
      return xlsxResponse(wb, `Reporte_Cajas${filterTag}_${today}.xlsx`, {
        'X-Export-Kind': 'boxes',
        'X-Export-Boxes': String(boxRows.length),
        'X-Export-Filtered': hasCatalogFilter ? '1' : '0',
        'X-Export-Series-Parts': String(partsNeeded),
      });
    }

    // ETL: fases internas → un solo Excel con hojas Cajas + Series.
    if (kind === 'boxes-series-etl' || kind === 'series-etl') {
      const boxRows = boxes.map(toExcelBoxRow);
      const { rows: seriesRows, phases } = await loadAllSeriesViaEtlPhases(
        db,
        boxes,
        filters
      );

      if (seriesRows.length === 0) {
        return NextResponse.json(
          {
            error: 'No hay series para exportar en el filtro',
            detail: 'Las cajas del filtro no tienen equipos en bodega con ese criterio.',
          },
          { status: 404 }
        );
      }

      const wb = XLSX.utils.book_new();
      const wsBoxes = XLSX.utils.json_to_sheet(boxRows);
      wsBoxes['!cols'] = BOX_COLS;
      XLSX.utils.book_append_sheet(wb, wsBoxes, 'Detalle Cajas');

      const wsSeries = XLSX.utils.json_to_sheet(seriesRows);
      wsSeries['!cols'] = SERIES_COLS;
      XLSX.utils.book_append_sheet(wb, wsSeries, 'Series');

      return xlsxResponse(
        wb,
        `Reporte_Cajas_y_Series${filterTag}_ETL_${today}.xlsx`,
        {
          'X-Export-Kind': 'boxes-series-etl',
          'X-Export-Boxes': String(boxRows.length),
          'X-Export-Series': String(seriesRows.length),
          'X-Export-Phases': String(phases),
          'X-Export-Filtered': hasCatalogFilter ? '1' : '0',
        }
      );
    }

    // kind === 'series' — una parte por lote de cajas (fallback)
    const page = await fetchFilteredWarehouseSeriesForExport(db, boxes, filters, {
      boxOffset,
      boxLimit,
    });

    if (page.rows.length === 0 && page.done && boxOffset === 0) {
      return NextResponse.json(
        { error: 'No hay series para exportar en el filtro' },
        { status: 404 }
      );
    }

    if (page.rows.length === 0) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'X-Export-Kind': 'series',
          'X-Export-Done': '1',
          'X-Export-Next-Box-Offset': '',
          'X-Export-Boxes-Total': String(page.totalBoxes),
        },
      });
    }

    const partIndex = Math.floor(boxOffset / boxLimit) + 1;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(page.rows);
    ws['!cols'] = [
      { wch: 14 },
      { wch: 22 },
      { wch: 12 },
      { wch: 12 },
      { wch: 16 },
      { wch: 14 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 12 },
      { wch: 12 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, `Series p${partIndex}`);
    const partPad = String(partIndex).padStart(2, '0');
    return xlsxResponse(
      wb,
      `Reporte_Series${filterTag}_p${partPad}_${today}.xlsx`,
      {
        'X-Export-Kind': 'series',
        'X-Export-Series': String(page.rows.length),
        'X-Export-Boxes-In-Part': String(page.boxesInPart),
        'X-Export-Boxes-Total': String(page.totalBoxes),
        'X-Export-Done': page.done ? '1' : '0',
        'X-Export-Next-Box-Offset':
          page.nextBoxOffset == null ? '' : String(page.nextBoxOffset),
        'X-Export-Part': String(partIndex),
        'X-Export-Filtered': hasCatalogFilter ? '1' : '0',
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Export Error:', message, err);
    return NextResponse.json(
      { error: 'Error generando reporte', detail: message },
      { status: 500 }
    );
  }
}

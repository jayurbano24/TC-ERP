/**
 * Salida de bodega por lista de SERIES (warehouse_salida_parcial_tx).
 *
 *   cd web
 *   # Pegue el listado en dist/series-salida-raw.txt (una o muchas series por línea)
 *   npm run ops:serial-salida -- --file=dist/series-salida-raw.txt --guide=TC-INV-2026-XXXX
 *   npm run ops:serial-salida -- --file=dist/series-salida-raw.txt --guide=TC-INV-2026-XXXX --apply
 *
 *   npm run ops:serial-salida:paste   # Ctrl+C desde Excel → dist/series-salida-raw.txt
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { v5 as uuidv5 } from 'uuid';
import { WAREHOUSE_INVENTORY_STATUSES } from '../src/lib/database/warehouse';
import { safeWriteExportFile } from './lib/safeWriteExportFile';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

const WAREHOUSE_IDEMPOTENCY_NS = 'a3f2c8e1-9b4d-4e7a-8c1f-2d6e9a0b5c3d';

function warehouseBoxIdempotencyKey(boxId: string, action: 'salida', target: string): string {
  return uuidv5(`${action}:${boxId}:${target}`, WAREHOUSE_IDEMPOTENCY_NS);
}

const JUNK = /^(ASDF|DFGH|FGH|1515151511511589A|7889798798A|80956559861111|F119815189981S|A6SD5F1A5SDF16A|A894915F16AS1DF|485\[5443|646D4E44E93048575443)/i;

/** Extrae serials de texto pegado (líneas sueltas o concatenadas). */
export function extractSerialsFromRawText(raw: string): string[] {
  let text = raw.replace(/^\uFEFF/, '');
  text = text
    .replace(/(ZTEATV\d{11})(?=ZTEATV)/gi, '$1\n')
    .replace(/(BS100[0-9A-Z]{10,22})(?=BS100)/gi, '$1\n')
    .replace(/(BS500000[0-9A-Z]{5,15})(?=BS500000)/gi, '$1\n')
    .replace(/(48575443[A-F0-9]{8})(?=48575443)/gi, '$1\n');

  const found = new Set<string>();

  const push = (s: string) => {
    const u = s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (u.length < 8 || JUNK.test(u)) return;
    if (/^0000+$/.test(u)) return;
    found.add(u);
  };

  const patterns: RegExp[] = [
    /BS500000[0-9A-Z]{5,18}/gi,
    /BS100[0-9A-Z]{10,22}/gi,
    /ZTEATV\d{11}/gi,
    /ZTEGD[A-F0-9]{8,14}/gi,
    /ZTE0QHBQ[0-9A-Z]{7,12}/gi,
    /ZTEEQHBP[0-9A-Z]{7,12}/gi,
    /ZXCC[0-9A-Z]{10,16}/gi,
    /WPCC[0-9A-Z]{10,18}/gi,
    /WTCC[0-9A-Z]{10,16}/gi,
    /SNF[0-9A-Z]{10,18}/gi,
    /48575443[A-F0-9]{8,12}/gi,
    /48575443[A-F0-9]{4}(?=[A-F0-9]{4})/gi,
    /983910[0-9A-F]{6,12}/gi,
    /743AEF[0-9A-F]{6,12}/gi,
    /840112[0-9A-F]{6,12}/gi,
    /9877E7[0-9A-F]{6,12}/gi,
    /90F891[0-9A-F]{6,12}/gi,
    /1834AF[0-9A-F]{6,12}/gi,
    /2491BB[0-9A-F]{6,12}/gi,
    /382028[0-9A-F]{6,12}/gi,
    /08798C[0-9A-F]{6,12}/gi,
    /C4FBAA[0-9A-F]{6,12}/gi,
    /58AEA8[0-9A-F]{6,12}/gi,
    /04E795[0-9A-F]{6,12}/gi,
    /14230A[0-9A-F]{6,12}/gi,
    /2841EC[0-9A-F]{6,12}/gi,
    /88E056[0-9A-F]{6,12}/gi,
    /2CA79E[0-9A-F]{6,12}/gi,
    /FC7[A-Z0-9!]{4,12}/gi,
    /F8345A[A-F0-9]{6,12}/gi,
    /B522[0-9A-Z]{6,14}/gi,
    /149448[A-F0-9]{6,12}/gi,
    /50A5[A-Z0-9]{6,12}/gi,
    /70DFF7[A-F0-9]{6,12}/gi,
    /23[TUVWY][0-9A-Z]{4,12}EC[0-9A-Z]{6,12}/gi,
    /1[ATU][0-9A-Z]{4,12}D96[0-9A-Z]{6,12}/gi,
    /18[VXY][0-9A-Z]{4,12}D96[0-9A-Z]{6,12}/gi,
    /22[GFTUVW][0-9A-Z]{4,12}D96[0-9A-Z]{6,12}/gi,
    /ERUX[A-Z0-9]{6,12}/gi,
    /1RUP[A-Z0-9]{6,12}/gi,
    /QS3T31[A-Z0-9]{6,12}/gi,
    /QS5441[A-Z0-9]{6,12}/gi,
    /QS5841[0-9A-Z]{6,12}/gi,
    /U8E0133[0-9A-Z]{6,12}/gi,
    /U8E5148[0-9A-Z]{6,12}/gi,
    /U8E1154[0-9A-Z]{6,12}/gi,
    /U8KY1[0-9A-Z]{6,12}/gi,
    /M1[0-9]{3}[A-Z]{2}[0-9A-Z]{4,10}/gi,
    /MV20[0-9]{2}VR[0-9]{4}/gi,
    /MA[0-9]{4}[A-Z0-9]{6,12}/gi,
    /YH8TT[0-9A-Z]{6,12}/gi,
    /202[0-9]{10,14}/gi,
    /61522[0-9]{12,15}/gi,
    /63121[0-9]{12,15}/gi,
    /63921[0-9]{12,15}/gi,
    /64721[0-9]{12,15}/gi,
    /65221[0-9]{12,15}/gi,
    /65524[0-9]{12,18}/gi,
    /60722[0-9]{12,15}/gi,
    /62522[0-9]{12,15}/gi,
    /61222[0-9]{12,15}/gi,
    /230[0-9]{9,12}/gi,
    /224000[0-9]{6,12}/gi,
    /2251436[A-Z0-9]{5,10}/gi,
    /215008[0-9A-Z]{10,22}/gi,
    /219776[0-9]{9,12}/gi,
    /RP25032022/gi,
    /RC25102023[A-Z0-9]*/gi,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      push(m[0]);
    }
  }

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.length >= 8 && t.length <= 32 && /^[A-Z0-9-]+$/i.test(t)) {
      push(t.replace(/-DUP$/i, '').replace(/-32$/i, ''));
    }
  }

  return [...found].sort();
}

type SerialResolveRow = {
  requested: string;
  serialNumber: string;
  serviceOrderId: string | null;
  osNumber: number | null;
  boxId: string;
  boxCode: string;
  seriesStatus: string;
};

async function resolveSerials(
  db: SupabaseClient,
  serials: string[],
): Promise<{
  resolved: SerialResolveRow[];
  skipped: string[];
  errors: string[];
}> {
  const skipped: string[] = [];
  const errors: string[] = [];
  const resolved: SerialResolveRow[] = [];
  const chunk = 150;

  for (let i = 0; i < serials.length; i += chunk) {
    const part = serials.slice(i, i + chunk);
    const { data: rows, error } = await db
      .from('series')
      .select('id, serial_number, current_box_id, current_status, service_order_id')
      .in('serial_number', part);
    if (error) throw error;

    const bySn = new Map(
      (rows ?? []).map((r) => [String(r.serial_number).toUpperCase(), r]),
    );

    for (const req of part) {
      const row = bySn.get(req);
      if (!row) {
        errors.push(`${req}: serie no encontrada en BD`);
        continue;
      }
      if (String(row.current_status) === 'dispatched') {
        skipped.push(`${req}: ya dispatched`);
        continue;
      }
      if (
        !row.current_box_id ||
        !WAREHOUSE_INVENTORY_STATUSES.includes(
          String(row.current_status) as (typeof WAREHOUSE_INVENTORY_STATUSES)[number],
        )
      ) {
        errors.push(
          `${req}: no en caja bodega (status=${row.current_status}, box=${row.current_box_id ?? '—'})`,
        );
        continue;
      }

      resolved.push({
        requested: req,
        serialNumber: String(row.serial_number).toUpperCase(),
        serviceOrderId: row.service_order_id as string | null,
        osNumber: null,
        boxId: row.current_box_id as string,
        boxCode: '',
        seriesStatus: String(row.current_status),
      });
    }
  }

  const osIds = [
    ...new Set(resolved.map((r) => r.serviceOrderId).filter((id): id is string => Boolean(id))),
  ];
  if (osIds.length) {
    const { data: orders } = await db.from('service_orders').select('id, os_number').in('id', osIds);
    const osMap = new Map((orders ?? []).map((o) => [o.id as string, o.os_number as number]));
    for (const r of resolved) {
      if (r.serviceOrderId) r.osNumber = osMap.get(r.serviceOrderId) ?? null;
    }
  }

  const boxIds = [...new Set(resolved.map((r) => r.boxId))];
  if (boxIds.length) {
    const { data: boxes } = await db.from('boxes').select('id, box_code').in('id', boxIds);
    const boxMap = new Map((boxes ?? []).map((b) => [b.id as string, String(b.box_code ?? '')]));
    for (const r of resolved) r.boxCode = boxMap.get(r.boxId) ?? '';
  }

  return { resolved, skipped, errors };
}

async function writeSerialSalidaExcel(options: {
  guide: string;
  mode: 'DRY-RUN' | 'APLICADO';
  resolved: SerialResolveRow[];
  skipped: string[];
  errors: string[];
  extractedCount: number;
}): Promise<string> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Series salida');
  ws.columns = [
    { header: 'Guía / Conduce', key: 'guide', width: 22 },
    { header: 'Serie', key: 'serial', width: 24 },
    { header: 'OS', key: 'os', width: 10 },
    { header: 'Caja', key: 'box', width: 14 },
    { header: 'Estado serie', key: 'status', width: 18 },
    { header: 'Modo', key: 'mode', width: 12 },
  ];
  for (const row of options.resolved) {
    ws.addRow({
      guide: options.guide,
      serial: row.serialNumber,
      os: row.osNumber ?? '',
      box: row.boxCode,
      status: row.seriesStatus,
      mode: options.mode,
    });
  }
  const ws2 = wb.addWorksheet('Resumen');
  ws2.addRow(['Series extraídas del archivo', options.extractedCount]);
  ws2.addRow(['Listas para salida RPC', options.resolved.length]);
  ws2.addRow(['Omitidas', options.skipped.length]);
  ws2.addRow(['Errores / no en bodega', options.errors.length]);
  const ws3 = wb.addWorksheet('Omitidas y errores');
  for (const s of options.skipped) ws3.addRow(['omitida', s]);
  for (const e of options.errors) ws3.addRow(['error', e]);

  const safeGuide = options.guide.replace(/[^\w.-]+/g, '_');
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(process.cwd(), 'dist', `SERIES-SALIDA_${safeGuide}_${stamp}.xlsx`);
  return safeWriteExportFile(outPath, Buffer.from(await wb.xlsx.writeBuffer()));
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const fileArg = process.argv.find((a) => a.startsWith('--file='))?.split('=')[1];
  const guideArg = process.argv.find((a) => a.startsWith('--guide='))?.split('=')[1]?.trim();

  if (!fileArg || !guideArg) {
    console.error(
      'Uso: npm run ops:serial-salida -- --file=dist/series-salida-raw.txt --guide=TC-INV-XXXX [--apply]',
    );
    process.exit(1);
  }
  if (guideArg.includes('XXXX') || guideArg === 'TC-INV-TU-GUIA') {
    console.error('[ops:serial-salida] Use guía/conduce real (TC-INV-…).');
    process.exit(1);
  }

  const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`No existe: ${filePath}`);
    console.error('Pegue el listado en ese archivo o: npm run ops:serial-salida:paste');
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const serials = extractSerialsFromRawText(raw);
  if (serials.length === 0) {
    console.error('[ops:serial-salida] No se extrajeron series válidas del archivo.');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error('Falta Supabase en .env.local');
    process.exit(1);
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  console.log(
    `[ops:serial-salida] ${apply ? 'APPLY' : 'DRY-RUN'} · ${serials.length} series · guía ${guideArg}`,
  );

  const { resolved, skipped, errors } = await resolveSerials(db, serials);
  const byBox = new Map<string, string[]>();
  for (const row of resolved) {
    const list = byBox.get(row.boxId) ?? [];
    list.push(row.serialNumber);
    byBox.set(row.boxId, list);
  }

  console.log(
    JSON.stringify(
      {
        extraidas: serials.length,
        enBodega: resolved.length,
        cajas: byBox.size,
        omitidas: skipped.length,
        errores: errors.length,
      },
      null,
      2,
    ),
  );

  const excelPath = await writeSerialSalidaExcel({
    guide: guideArg,
    mode: apply ? 'APLICADO' : 'DRY-RUN',
    resolved,
    skipped,
    errors,
    extractedCount: serials.length,
  });
  console.log(`\n[ops:serial-salida] Excel guía + series:\n${excelPath}`);

  if (!apply) {
    console.log('\nRevise el Excel. Para despachar: agregue --apply');
    return;
  }

  let dispatched = 0;
  const applyErrors: string[] = [];
  for (const [boxId, sns] of byBox) {
    const unique = [...new Set(sns)];
    for (let i = 0; i < unique.length; i += 35) {
      const chunk = unique.slice(i, i + 35);
      const idempotencyKey = warehouseBoxIdempotencyKey(
        boxId,
        'salida',
        `batch-serial:${guideArg}:${chunk.sort().join(',')}`,
      );
      const { data, error } = await db.rpc('warehouse_salida_parcial_tx', {
        p_box_id: boxId,
        p_serial_numbers: chunk,
        p_destination: guideArg,
        p_guide_number: guideArg,
        p_operator_id: null,
        p_operator_name: 'Sistema · batch series salida',
        p_notes: `Salida retroactiva por listado series (${chunk.length})`,
        p_idempotency_key: idempotencyKey,
        p_dispatch_batch_id: null,
      });
      if (error) {
        applyErrors.push(`caja ${boxId}: ${error.message}`);
        continue;
      }
      const payload = data as { series_count?: number };
      dispatched += payload?.series_count ?? chunk.length;
    }
  }
  console.log(JSON.stringify({ seriesDespachadas: dispatched, applyErrors: applyErrors.slice(0, 30) }, null, 2));
  if (applyErrors.length) process.exit(2);
}

const entry = process.argv[1]?.replace(/\\/g, '/') ?? '';
const isDirectRun = /batch-serial-salida\.ts$/.test(entry);
if (isDirectRun) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

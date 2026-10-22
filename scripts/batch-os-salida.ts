/**
 * Registra salida de bodega (warehouse_salida_parcial_tx) por lista de OS.
 * Usa service role — mismo flujo que Bodega → Despachar (salida parcial + hermanas OS).
 *
 *   cd web
 *   npm run ops:os-salida -- --file=dist/os-salida-list.txt --guide=TC-INV-2026-XXXX
 *   npm run ops:os-salida -- --file=dist/os-salida-list.txt --guide=TC-INV-2026-XXXX --apply
 *
 * Archivo: un os_number por línea (solo dígitos). Líneas vacías y # comentarios se ignoran.
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

function parseOsNumberToken(line: string): number | null {
  const t = line.replace(/^\uFEFF/, '').trim();
  if (!t || t.startsWith('#')) return null;

  const tc = t.match(/(?:^|\s)TC[-\s]?0*(\d{3,7})(?:\s|$|[^\d])/i);
  if (tc) {
    const n = Number.parseInt(tc[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  // Excel: una celda o fila con tabs/comas — primer grupo de 4–7 dígitos
  const plain = t.match(/\b(\d{4,7})\b/);
  if (plain) {
    const n = Number.parseInt(plain[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function parseOsNumbersFromFile(filePath: string): number[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const out = new Set<number>();
  for (const line of raw.split(/\r?\n/)) {
    const n = parseOsNumberToken(line);
    if (n != null) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

function countNonEmptyDataLines(filePath: string): number {
  const raw = fs.readFileSync(filePath, 'utf8');
  let n = 0;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.replace(/^\uFEFF/, '').trim();
    if (!t || t.startsWith('#')) continue;
    n += 1;
  }
  return n;
}

type OsResolveRow = {
  osNumber: number;
  serviceOrderId: string;
  osStatus: string;
  seedSerial: string;
  mainSerial: string;
  allSerials: string[];
  boxId: string;
  boxCode: string;
  seriesStatus: string;
};

async function writeSalidaDetailExcel(options: {
  guide: string;
  mode: 'DRY-RUN' | 'APLICADO';
  resolved: OsResolveRow[];
  skipped: string[];
  errors: string[];
}): Promise<string> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Salida por OS');
  ws.columns = [
    { header: 'Guía / Conduce', key: 'guide', width: 22 },
    { header: 'OS', key: 'os', width: 10 },
    { header: 'Estado OS', key: 'osStatus', width: 14 },
    { header: 'Caja', key: 'box', width: 16 },
    { header: 'Serie principal', key: 'main', width: 22 },
    { header: 'Serie semilla (RPC)', key: 'seed', width: 22 },
    { header: 'Todas las series OS', key: 'allSeries', width: 48 },
    { header: 'Estado serie en bodega', key: 'seriesStatus', width: 22 },
    { header: 'Modo script', key: 'mode', width: 12 },
  ];

  for (const row of options.resolved) {
    ws.addRow({
      guide: options.guide,
      os: row.osNumber,
      osStatus: row.osStatus,
      box: row.boxCode || row.boxId,
      main: row.mainSerial,
      seed: row.seedSerial,
      allSeries: row.allSerials.join(' · '),
      seriesStatus: row.seriesStatus,
      mode: options.mode,
    });
  }

  const wsErr = wb.addWorksheet('Omitidas y errores');
  wsErr.columns = [
    { header: 'Tipo', key: 'kind', width: 12 },
    { header: 'Detalle', key: 'detail', width: 80 },
  ];
  for (const s of options.skipped) wsErr.addRow({ kind: 'omitida', detail: s });
  for (const e of options.errors) wsErr.addRow({ kind: 'error', detail: e });

  const safeGuide = options.guide.replace(/[^\w.-]+/g, '_');
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(process.cwd(), 'dist', `OS-SALIDA_${safeGuide}_${stamp}.xlsx`);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return safeWriteExportFile(outPath, buffer);
}

async function exportDispatchedByGuide(db: SupabaseClient, guide: string): Promise<string> {
  const { data: dispatches, error: dErr } = await db
    .from('dispatches')
    .select('id, guide_number, dispatched_at, notes, box_id')
    .eq('guide_number', guide);
  if (dErr) throw dErr;
  if (!dispatches?.length) {
    throw new Error(`No hay despachos registrados con guía ${guide}`);
  }

  const dispatchIds = dispatches.map((d) => d.id as string);
  const { data: items, error: iErr } = await db
    .from('dispatch_items')
    .select('dispatch_id, series_id, box_id')
    .in('dispatch_id', dispatchIds);
  if (iErr) throw iErr;

  const seriesIds = [...new Set((items ?? []).map((i) => i.series_id as string))];
  const { data: seriesRows, error: sErr } = await db
    .from('series')
    .select('id, serial_number, service_order_id, current_status')
    .in('id', seriesIds);
  if (sErr) throw sErr;

  const osIds = [
    ...new Set(
      (seriesRows ?? [])
        .map((s) => s.service_order_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: orders } = await db.from('service_orders').select('id, os_number').in('id', osIds);
  const osById = new Map((orders ?? []).map((o) => [o.id as string, o.os_number as number]));

  const boxIds = [...new Set((items ?? []).map((i) => i.box_id).filter(Boolean))] as string[];
  const { data: boxes } = await db.from('boxes').select('id, box_code').in('id', boxIds);
  const boxById = new Map((boxes ?? []).map((b) => [b.id as string, b.box_code as string]));

  const dispatchById = new Map(dispatches.map((d) => [d.id as string, d]));

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Series despachadas');
  ws.columns = [
    { header: 'Guía / Conduce', key: 'guide', width: 22 },
    { header: 'Fecha despacho', key: 'at', width: 22 },
    { header: 'OS', key: 'os', width: 10 },
    { header: 'Serie', key: 'serial', width: 24 },
    { header: 'Estado serie', key: 'status', width: 18 },
    { header: 'Caja origen', key: 'box', width: 16 },
    { header: 'Notas', key: 'notes', width: 30 },
  ];

  for (const item of items ?? []) {
    const s = (seriesRows ?? []).find((r) => r.id === item.series_id);
    const d = dispatchById.get(item.dispatch_id as string);
    ws.addRow({
      guide: d?.guide_number ?? guide,
      at: d?.dispatched_at ?? '',
      os: s?.service_order_id ? osById.get(s.service_order_id) : '',
      serial: s?.serial_number ?? '',
      status: s?.current_status ?? '',
      box: item.box_id ? boxById.get(item.box_id as string) : '',
      notes: d?.notes ?? '',
    });
  }

  const safeGuide = guide.replace(/[^\w.-]+/g, '_');
  const outPath = path.join(process.cwd(), 'dist', `CONDUCE_${safeGuide}_series.xlsx`);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return safeWriteExportFile(outPath, buffer);
}

async function resolveOsBatch(
  db: SupabaseClient,
  osNumbers: number[],
): Promise<{ resolved: OsResolveRow[]; skipped: string[]; errors: string[] }> {
  const skipped: string[] = [];
  const errors: string[] = [];
  const resolved: OsResolveRow[] = [];

  const { data: orders, error: oErr } = await db
    .from('service_orders')
    .select('id, os_number, status, main_serial, series_id')
    .in('os_number', osNumbers);
  if (oErr) throw oErr;

  const byOs = new Map((orders ?? []).map((o) => [o.os_number as number, o]));
  for (const osNumber of osNumbers) {
    const o = byOs.get(osNumber);
    if (!o) {
      errors.push(`${osNumber}: OS no encontrada`);
      continue;
    }
    if (String(o.status) === 'DESPACHADO') {
      skipped.push(`${osNumber}: OS ya DESPACHADO`);
      continue;
    }

    const { data: seriesRows, error: sErr } = await db
      .from('series')
      .select('id, serial_number, current_box_id, current_status, service_order_id')
      .eq('service_order_id', o.id);
    if (sErr) {
      errors.push(`${osNumber}: ${sErr.message}`);
      continue;
    }

    const inWarehouse = (seriesRows ?? []).filter(
      (s) =>
        s.current_box_id &&
        WAREHOUSE_INVENTORY_STATUSES.includes(
          String(s.current_status) as (typeof WAREHOUSE_INVENTORY_STATUSES)[number],
        ),
    );

    if (inWarehouse.length === 0) {
      const anyDispatched = (seriesRows ?? []).every((s) => String(s.current_status) === 'dispatched');
      if (anyDispatched && (seriesRows?.length ?? 0) > 0) {
        skipped.push(`${osNumber}: series ya dispatched (revisar OS status)`);
      } else {
        errors.push(`${osNumber}: sin series en caja de bodega (${(seriesRows ?? []).length} filas)`);
      }
      continue;
    }

    const main = (o.main_serial as string | null)?.trim().toUpperCase();
    const pick =
      inWarehouse.find((s) => main && String(s.serial_number).toUpperCase() === main) ??
      inWarehouse[0];

    const boxId = pick.current_box_id as string;
    const seedSerial = String(pick.serial_number).trim().toUpperCase();
    const allSerials = (seriesRows ?? [])
      .map((s) => String(s.serial_number ?? '').trim().toUpperCase())
      .filter(Boolean);
    resolved.push({
      osNumber,
      serviceOrderId: o.id as string,
      osStatus: String(o.status),
      seedSerial,
      mainSerial: (o.main_serial as string | null)?.trim().toUpperCase() || seedSerial,
      allSerials,
      boxId,
      boxCode: '',
      seriesStatus: String(pick.current_status),
    });
  }

  const boxIds = [...new Set(resolved.map((r) => r.boxId))];
  if (boxIds.length > 0) {
    const { data: boxes } = await db.from('boxes').select('id, box_code').in('id', boxIds);
    const codeById = new Map((boxes ?? []).map((b) => [b.id as string, String(b.box_code ?? '')]));
    for (const row of resolved) {
      row.boxCode = codeById.get(row.boxId) ?? '';
    }
  }

  return { resolved, skipped, errors };
}

function parseOsNumbersFromArgv(): number[] {
  const osArg = process.argv.find((a) => a.startsWith('--os='))?.split('=')[1];
  if (!osArg?.trim()) return [];
  const out = new Set<number>();
  for (const part of osArg.split(/[,;\s]+/)) {
    const n = parseOsNumberToken(part);
    if (n != null) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

async function parseOsNumbersFromXlsx(xlsxPath: string, columnHint?: string): Promise<number[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  let colIndex = 1;
  if (columnHint?.trim()) {
    const want = columnHint.trim().toLowerCase();
    headerRow.eachCell((cell, col) => {
      const h = String(cell.value ?? '').trim().toLowerCase();
      if (h === want || h.includes(want)) colIndex = col;
    });
  } else {
    headerRow.eachCell((cell, col) => {
      const h = String(cell.value ?? '').trim().toLowerCase();
      if (h === 'n.º' || h === 'nº' || h === 'os' || h.includes('número') && h.includes('orden')) {
        colIndex = col;
      }
    });
  }

  const out = new Set<number>();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const v = row.getCell(colIndex).value;
    const text =
      typeof v === 'number'
        ? String(Math.trunc(v))
        : typeof v === 'object' && v && 'text' in v
          ? String((v as { text: string }).text)
          : String(v ?? '');
    const n = parseOsNumberToken(text);
    if (n != null) out.add(n);
  });
  return [...out].sort((a, b) => a - b);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const exportGuideOnly = process.argv.includes('--export-guide-only');
  const fileArg = process.argv.find((a) => a.startsWith('--file='))?.split('=')[1];
  const xlsxArg = process.argv.find((a) => a.startsWith('--from-xlsx='))?.split('=')[1];
  const xlsxCol = process.argv.find((a) => a.startsWith('--column='))?.split('=')[1];
  const guideArg = process.argv.find((a) => a.startsWith('--guide='))?.split('=')[1]?.trim();

  const urlEarly = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const keyEarly = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (exportGuideOnly) {
    if (!guideArg || !urlEarly || !keyEarly) {
      console.error('Uso: npm run ops:os-salida -- --export-guide-only --guide=TC-INV-2026-0123');
      process.exit(1);
    }
    const dbOnly = createClient(urlEarly, keyEarly, { auth: { persistSession: false } });
    try {
      const out = await exportDispatchedByGuide(dbOnly, guideArg);
      console.log(`[ops:os-salida] Excel con series ya despachadas:\n${out}`);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
    return;
  }

  if (!guideArg) {
    console.error('Uso (elija una fuente de OS + guía):');
    console.error('  npm run ops:os-salida -- --file=dist/os-salida-list.txt --guide=TC-INV-XXXX');
    console.error('  npm run ops:os-salida -- --os=70831,71556 --guide=TC-INV-XXXX');
    console.error('  npm run ops:os-salida -- --from-xlsx=dist/lista.xlsx --guide=TC-INV-XXXX');
    console.error('  npm run ops:os-salida:paste   # copia columna en Excel → Ctrl+C → luego este comando');
    process.exit(1);
  }

  if (guideArg.includes('XXXX') || guideArg === 'TC-INV-TU-GUIA') {
    console.error('[ops:os-salida] Use la guía/conduce REAL (ej. TC-INV-2026-0123), no un placeholder.');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }

  let osNumbers = parseOsNumbersFromArgv();

  if (osNumbers.length === 0 && xlsxArg) {
    const xlsxPath = path.isAbsolute(xlsxArg) ? xlsxArg : path.join(process.cwd(), xlsxArg);
    if (!fs.existsSync(xlsxPath)) {
      console.error(`No existe Excel: ${xlsxPath}`);
      process.exit(1);
    }
    osNumbers = await parseOsNumbersFromXlsx(xlsxPath, xlsxCol);
    console.log(`[ops:os-salida] Leídas ${osNumbers.length} OS desde ${xlsxPath}`);
  }

  if (osNumbers.length === 0 && fileArg) {
    const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
    if (!fs.existsSync(filePath)) {
      console.error(`No existe el archivo: ${filePath}`);
      process.exit(1);
    }
    const dataLines = countNonEmptyDataLines(filePath);
    osNumbers = parseOsNumbersFromFile(filePath);
    if (osNumbers.length === 0) {
      console.error('');
      console.error('[ops:os-salida] El archivo no contiene números de OS válidos.');
      console.error(`  Archivo: ${filePath}`);
      console.error(`  Líneas con texto (sin contar # comentarios): ${dataLines}`);
      if (dataLines === 0) {
        console.error('');
        console.error('  → Más fácil en Windows: copie la columna en Excel (Ctrl+C) y ejecute:');
        console.error('       npm run ops:os-salida:paste');
        console.error('     Luego:');
        console.error('       npm run ops:os-salida -- --file=dist/os-salida-list.txt --guide=SU-GUIA');
      } else {
        console.error('');
        console.error('  → Use por línea: 70831  o  TC-70831');
      }
      console.error('');
      process.exit(1);
    }
  }

  if (osNumbers.length === 0) {
    console.error('[ops:os-salida] Indique --file=, --os= o --from-xlsx=');
    process.exit(1);
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const destination = guideArg;

  console.log(
    `[ops:os-salida] ${apply ? 'APPLY' : 'DRY-RUN'} · ${osNumbers.length} OS · guía ${destination}`,
  );

  const { resolved, skipped, errors } = await resolveOsBatch(db, osNumbers);

  const byBox = new Map<string, string[]>();
  for (const row of resolved) {
    const list = byBox.get(row.boxId) ?? [];
    list.push(row.seedSerial);
    byBox.set(row.boxId, list);
  }

  console.log(
    JSON.stringify(
      {
        totalOs: osNumbers.length,
        resueltas: resolved.length,
        cajas: byBox.size,
        omitidas: skipped.length,
        errores: errors.length,
      },
      null,
      2,
    ),
  );

  if (skipped.length) console.log('\nOmitidas:\n', skipped.slice(0, 30).join('\n'));
  if (errors.length) console.log('\nErrores:\n', errors.slice(0, 30).join('\n'));

  const excelPath = await writeSalidaDetailExcel({
    guide: destination,
    mode: apply ? 'APLICADO' : 'DRY-RUN',
    resolved,
    skipped,
    errors,
  });
  console.log(`\n[ops:os-salida] Excel detalle (guía + series):\n${excelPath}`);
  console.log('  explorer.exe dist');

  if (!apply) {
    console.log('\n[ops:os-salida] Dry-run. Para ejecutar: agregue --apply');
    return;
  }

  let dispatched = 0;
  const applyErrors: string[] = [];

  for (const [boxId, serials] of byBox) {
    const unique = [...new Set(serials)];
    const chunkSize = 40;
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize);
      const idempotencyKey = warehouseBoxIdempotencyKey(
        boxId,
        'salida',
        `batch-os:${destination}:${chunk.sort().join(',')}`,
      );

      const { data, error } = await db.rpc('warehouse_salida_parcial_tx', {
        p_box_id: boxId,
        p_serial_numbers: chunk,
        p_destination: destination,
        p_guide_number: destination,
        p_operator_id: null,
        p_operator_name: 'Sistema · batch OS salida',
        p_notes: `Salida retroactiva lote OS (${chunk.length} semillas)`,
        p_idempotency_key: idempotencyKey,
        p_dispatch_batch_id: null,
      });

      if (error) {
        applyErrors.push(`caja ${boxId}: ${error.message}`);
        continue;
      }
      const payload = data as { series_count?: number };
      dispatched += payload?.series_count ?? chunk.length;
      console.log(`[ops:os-salida] OK caja ${boxId} · semillas ${chunk.length} · rpc`, payload);
    }
  }

  console.log(
    JSON.stringify({ seriesDespachadas: dispatched, applyErrors: applyErrors.slice(0, 20) }, null, 2),
  );
  if (applyErrors.length) process.exit(2);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

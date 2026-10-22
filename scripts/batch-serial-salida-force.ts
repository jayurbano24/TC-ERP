/**
 * Salida forzada de series fuera de caja (taller, QC, recepción, etc.).
 * No usa warehouse_salida_parcial_tx (exige caja). Actualiza series + OS + dispatches.
 *
 *   npm run ops:serial-salida:force -- --file=dist/series-salida-raw.txt --guide=TC-INV-2026-0123
 *   npm run ops:serial-salida:force -- --file=dist/series-salida-raw.txt --guide=TC-INV-2026-0123 --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { extractSerialsFromRawText } from './batch-serial-salida';
import { safeWriteExportFile } from './lib/safeWriteExportFile';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

type SeriesRow = {
  id: string;
  serial_number: string;
  current_status: string;
  current_box_id: string | null;
  service_order_id: string | null;
};

async function loadSeriesBySerials(db: SupabaseClient, serials: string[]): Promise<SeriesRow[]> {
  const out: SeriesRow[] = [];
  for (let i = 0; i < serials.length; i += 200) {
    const part = serials.slice(i, i + 200);
    const { data, error } = await db
      .from('series')
      .select('id, serial_number, current_status, current_box_id, service_order_id')
      .in('serial_number', part);
    if (error) throw error;
    out.push(...((data || []) as SeriesRow[]));
  }
  return out;
}

async function expandOsSiblings(db: SupabaseClient, seeds: SeriesRow[]): Promise<SeriesRow[]> {
  const byId = new Map(seeds.map((s) => [s.id, s]));
  const osIds = [
    ...new Set(seeds.map((s) => s.service_order_id).filter((id): id is string => Boolean(id))),
  ];
  for (let i = 0; i < osIds.length; i += 100) {
    const part = osIds.slice(i, i + 100);
    const { data, error } = await db
      .from('series')
      .select('id, serial_number, current_status, current_box_id, service_order_id')
      .in('service_order_id', part)
      .neq('current_status', 'dispatched');
    if (error) throw error;
    for (const row of (data || []) as SeriesRow[]) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()].filter((s) => String(s.current_status) !== 'dispatched');
}

async function writeExcel(options: {
  guide: string;
  mode: string;
  rows: Array<{ serial: string; statusBefore: string; os: number | string; ok: boolean; note: string }>;
  summary: Record<string, number>;
}): Promise<string> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Salida forzada');
  ws.columns = [
    { header: 'Guía', key: 'guide', width: 22 },
    { header: 'Serie', key: 'serial', width: 26 },
    { header: 'OS', key: 'os', width: 12 },
    { header: 'Estado previo', key: 'before', width: 28 },
    { header: 'OK', key: 'ok', width: 8 },
    { header: 'Nota', key: 'note', width: 50 },
    { header: 'Modo', key: 'mode', width: 12 },
  ];
  for (const r of options.rows) {
    ws.addRow({
      guide: options.guide,
      serial: r.serial,
      os: r.os,
      before: r.statusBefore,
      ok: r.ok ? 'SI' : 'NO',
      note: r.note,
      mode: options.mode,
    });
  }
  const ws2 = wb.addWorksheet('Resumen');
  for (const [k, v] of Object.entries(options.summary)) ws2.addRow([k, v]);
  const safe = options.guide.replace(/[^\w.-]+/g, '_');
  const out = path.join(
    process.cwd(),
    'dist',
    `SERIES-SALIDA-FORCE_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
  return safeWriteExportFile(out, Buffer.from(await wb.xlsx.writeBuffer()));
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const fileArg = process.argv.find((a) => a.startsWith('--file='))?.split('=')[1];
  const guideArg = process.argv.find((a) => a.startsWith('--guide='))?.split('=')[1]?.trim();
  if (!fileArg || !guideArg) {
    console.error(
      'Uso: npm run ops:serial-salida:force -- --file=dist/series-salida-raw.txt --guide=TC-INV-XXXX [--apply]',
    );
    process.exit(1);
  }
  if (guideArg.includes('XXXX') || guideArg === 'TC-INV-TU-GUIA') {
    console.error('Use guía real.');
    process.exit(1);
  }

  const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
  const raw = fs.readFileSync(filePath, 'utf8');
  const requested = extractSerialsFromRawText(raw);
  if (!requested.length) {
    console.error('Sin series en archivo.');
    process.exit(1);
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { persistSession: false } },
  );

  console.log(
    `[force-salida] ${apply ? 'APPLY' : 'DRY-RUN'} · ${requested.length} pedidas · guía ${guideArg}`,
  );

  const found = await loadSeriesBySerials(db, requested);
  const foundSn = new Set(found.map((s) => String(s.serial_number).toUpperCase()));
  const notFound = requested.filter((s) => !foundSn.has(s));
  const already = found.filter((s) => String(s.current_status) === 'dispatched');
  const pendingSeeds = found.filter((s) => String(s.current_status) !== 'dispatched');
  const pending = await expandOsSiblings(db, pendingSeeds);

  const osIds = [
    ...new Set(pending.map((s) => s.service_order_id).filter((id): id is string => Boolean(id))),
  ];
  const osNumberById = new Map<string, number>();
  for (let i = 0; i < osIds.length; i += 100) {
    const part = osIds.slice(i, i + 100);
    const { data } = await db.from('service_orders').select('id, os_number, status').in('id', part);
    for (const o of data || []) {
      osNumberById.set(o.id as string, o.os_number as number);
    }
  }

  const byStatus = new Map<string, number>();
  for (const s of pending) {
    const st = String(s.current_status);
    byStatus.set(st, (byStatus.get(st) || 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        pedidas: requested.length,
        noEncontradas: notFound.length,
        yaDespachadas: already.length,
        aDespacharInclHermanas: pending.length,
        porEstado: Object.fromEntries([...byStatus.entries()].sort((a, b) => b[1] - a[1])),
      },
      null,
      2,
    ),
  );

  const excelRows = pending.map((s) => ({
    serial: String(s.serial_number),
    statusBefore: String(s.current_status),
    os: s.service_order_id ? (osNumberById.get(s.service_order_id) ?? '') : '',
    ok: true,
    note: apply ? 'pendiente apply' : 'dry-run',
  }));

  if (!apply) {
    const excel = await writeExcel({
      guide: guideArg,
      mode: 'DRY-RUN',
      rows: excelRows,
      summary: {
        pedidas: requested.length,
        noEncontradas: notFound.length,
        yaDespachadas: already.length,
        aDespachar: pending.length,
      },
    });
    console.log(`\nExcel preview:\n${excel}\nPara aplicar: agregue --apply`);
    return;
  }

  // 1) Crear dispatch
  const { data: dispatch, error: dErr } = await db
    .from('dispatches')
    .insert({
      dispatch_type: 'individual',
      guide_number: guideArg,
      notes: `Salida forzada lote series (taller/QC/sin caja) · ${pending.length} series`,
      dispatched_by: null,
    })
    .select('id')
    .single();
  if (dErr) throw dErr;
  const dispatchId = dispatch.id as string;

  let seriesOk = 0;
  let seriesFail = 0;
  const osFail: string[] = [];
  const updatedOs = new Set<string>();

  // 2) Update series in chunks
  for (let i = 0; i < pending.length; i += 80) {
    const chunk = pending.slice(i, i + 80);
    const ids = chunk.map((s) => s.id);
    const { error } = await db
      .from('series')
      .update({
        current_status: 'dispatched',
        current_box_id: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);
    if (error) {
      seriesFail += chunk.length;
      for (const s of chunk) {
        const row = excelRows.find((r) => r.serial === String(s.serial_number));
        if (row) {
          row.ok = false;
          row.note = error.message;
        }
      }
      continue;
    }
    seriesOk += chunk.length;

    const items = chunk.map((s) => ({
      dispatch_id: dispatchId,
      series_id: s.id,
      box_id: s.current_box_id,
    }));
    const { error: iErr } = await db.from('dispatch_items').insert(items);
    if (iErr) {
      console.warn('[force-salida] dispatch_items:', iErr.message);
    }

    for (const s of chunk) {
      if (s.service_order_id) updatedOs.add(s.service_order_id);
      const row = excelRows.find((r) => r.serial === String(s.serial_number));
      if (row) {
        row.ok = true;
        row.note = 'dispatched';
      }
    }
  }

  // 3) OS → DESPACHADO
  let osOk = 0;
  for (const osId of updatedOs) {
    const { error } = await db
      .from('service_orders')
      .update({
        status: 'DESPACHADO',
        closed_at: new Date().toISOString(),
      })
      .eq('id', osId)
      .neq('status', 'DESPACHADO');
    if (error) {
      osFail.push(`${osNumberById.get(osId) ?? osId}: ${error.message}`);
    } else {
      osOk += 1;
    }
  }

  const excel = await writeExcel({
    guide: guideArg,
    mode: 'APLICADO',
    rows: excelRows,
    summary: {
      seriesOk,
      seriesFail,
      osOk,
      osFail: osFail.length,
      notFound: notFound.length,
    },
  });

  console.log(
    JSON.stringify(
      {
        dispatchId,
        seriesOk,
        seriesFail,
        osOk,
        osFailSample: osFail.slice(0, 15),
        excel,
      },
      null,
      2,
    ),
  );
  if (seriesFail > 0 || osFail.length > 0) process.exit(2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

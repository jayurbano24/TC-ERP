/**
 * ETL local: export En planta (~80k OS) sin timeout del navegador.
 *
 *   cd web
 *   npm run export:sap:en-planta          → CSV (recomendado, más rápido)
 *   npm run export:sap:en-planta:xlsx     → Excel
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { fetchEnPlantaSeriesExportRows } from '../src/lib/sap/fetchEnPlantaSeriesExportRows';
import { safeWriteExportFile } from './lib/safeWriteExportFile';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function writeCsv(
  outPath: string,
  rows: Awaited<ReturnType<typeof fetchEnPlantaSeriesExportRows>>['rows'],
): Promise<void> {
  const headers = [
    'OS',
    'Marca',
    'Modelo',
    'Tecnologia',
    'S1',
    'S2',
    'S3',
    'S4',
    'Estatus SAP',
    'Estatus operativo',
  ] as const;
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(outPath, { encoding: 'utf8' });
    stream.on('error', reject);
    stream.on('finish', () => resolve());
    stream.write('\ufeff');
    stream.write(`${headers.join(',')}\n`);
    for (const row of rows) {
      const line = headers.map((h) => escapeCsvCell(String(row[h] ?? ''))).join(',');
      stream.write(`${line}\n`);
    }
    stream.end();
  });
}

async function main(): Promise<void> {
  const formatArg = process.argv.find((a) => a.startsWith('--format='));
  const format = (formatArg?.split('=')[1] || process.env.SAP_EN_PLANTA_EXPORT_FORMAT || 'csv').toLowerCase();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error(
      '[export-sap-en-planta] Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local'
    );
    process.exit(1);
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log('[export-sap-en-planta] Leyendo OS en planta + series (ETL local, sin límite HTTP)…');
  console.log('[export-sap-en-planta] Puede tardar varios minutos (~80k OS).');
  const t0 = Date.now();

  const heartbeat = setInterval(() => {
    const min = Math.floor((Date.now() - t0) / 60000);
    const sec = Math.floor((Date.now() - t0) / 1000) % 60;
    console.log(`[export-sap-en-planta] En progreso… ${min}:${String(sec).padStart(2, '0')}`);
  }, 60_000);

  let payload: Awaited<ReturnType<typeof fetchEnPlantaSeriesExportRows>>;
  try {
    payload = await fetchEnPlantaSeriesExportRows(db);
  } finally {
    clearInterval(heartbeat);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = path.join(process.cwd(), 'dist');
  fs.mkdirSync(outDir, { recursive: true });

  let outFile: string;
  if (format === 'xlsx') {
    const ws = XLSX.utils.json_to_sheet(payload.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'En planta');
    const summary = XLSX.utils.json_to_sheet([
      {
        'OS en planta': payload.osCount,
        'Series en ledger': payload.seriesCount,
        Criterio: 'Una fila por OS única · Estatus operativo = Inventario OS',
      },
    ]);
    XLSX.utils.book_append_sheet(wb, summary, 'Resumen');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    outFile = safeWriteExportFile(path.join(outDir, `SAP_EN_PLANTA_${stamp}.xlsx`), buffer);
  } else if (format === 'csv') {
    outFile = path.join(outDir, `SAP_EN_PLANTA_${stamp}.csv`);
    await writeCsv(outFile, payload.rows);
  } else {
    console.error('[export-sap-en-planta] Formato inválido. Use --format=csv o --format=xlsx');
    process.exit(1);
  }

  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  console.log('');
  console.log('========== ETL SAP EN PLANTA ==========');
  console.log(`[export-sap-en-planta] OK · ${payload.osCount.toLocaleString()} OS · ${payload.seriesCount.toLocaleString()} series · ${sec}s`);
  console.log(`[export-sap-en-planta] Archivo:\n${outFile}`);
  console.log('=======================================');
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (/EBUSY|resource busy|locked/i.test(msg)) {
    console.error('[export-sap-en-planta] Archivo bloqueado (ciérrelo en Excel) e intente de nuevo.');
  } else {
    console.error('[export-sap-en-planta] Falló:', msg);
  }
  process.exit(1);
});

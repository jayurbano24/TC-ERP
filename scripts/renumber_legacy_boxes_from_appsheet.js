#!/usr/bin/env node
/**
 * Renumera cajas legacy (box_code no estándar) usando el export AppSheet.
 *
 * Archivo por defecto: web/tmp/CPE-MULTIMEDIA TCW (5).xlsx
 * Hoja principal: BodegaAlmacenaje (+ join BodegaTCW por id_bodegatcw)
 *
 * Uso:
 *   node scripts/renumber_legacy_boxes_from_appsheet.js           # dry-run
 *   node scripts/renumber_legacy_boxes_from_appsheet.js --apply   # aplicar en Supabase
 *   node scripts/renumber_legacy_boxes_from_appsheet.js --xlsx "ruta.xlsx"
 */

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const APPLY = process.argv.includes('--apply');
const xlsxArg = process.argv.find((a, i) => process.argv[i - 1] === '--xlsx');
const DEFAULT_XLSX = path.join(__dirname, '../tmp/CPE-MULTIMEDIA TCW (5).xlsx');
const XLSX_PATH = xlsxArg || DEFAULT_XLSX;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

function padBoxCode(num) {
  const n = parseInt(String(num), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return `BOX-${String(n).padStart(2, '0')}`;
}

/** TCW-BOX-77, TWC-BOX-656, TCW-B0X-948 → BOX-77 / BOX-948 */
function normalizeAppSheetBoxCode(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  const m =
    s.match(/T[CW][WC]?-?B[O0]C?X-?(\d+)/i) ||
    s.match(/^BOX-(\d+)$/i) ||
    s.match(/^TCE-BOX-(\d+)$/i);
  if (!m) return null;
  return padBoxCode(m[1]);
}

function isStandardErpBoxCode(code) {
  return !!code && /^BOX-\d+$/i.test(String(code).trim());
}

async function loadAppsheetMaps(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const alm = wb.getWorksheet('BodegaAlmacenaje');
  const tcw = wb.getWorksheet('BodegaTCW');
  if (!alm) throw new Error('Hoja BodegaAlmacenaje no encontrada');

  const tcwById = new Map();
  if (tcw) {
    tcw.eachRow((row, n) => {
      if (n === 1) return;
      const id = String(row.getCell(1).value || '').trim();
      const ods = String(row.getCell(3).value || '').trim();
      if (id && ods) tcwById.set(id, ods);
    });
  }

  const serialToBox = new Map();
  const labelToSerials = new Map();

  alm.eachRow((row, n) => {
    if (n === 1) return;
    const idbodega = String(row.getCell(1).value || '').trim();
    const idBodegaTcw = String(row.getCell(2).value || '').trim();
    let numeroBox = String(row.getCell(3).value || '').trim();

    if (!numeroBox || /^[a-f0-9]{8}$/i.test(numeroBox)) {
      numeroBox =
        tcwById.get(idBodegaTcw) || tcwById.get(idbodega) || numeroBox;
    }

    const serials = [4, 5, 6, 7]
      .map((c) => String(row.getCell(c).value || '').trim().toUpperCase())
      .filter(Boolean);

    const normalized = normalizeAppSheetBoxCode(numeroBox);
    const target = normalized || numeroBox;

    for (const sn of serials) {
      if (!serialToBox.has(sn)) serialToBox.set(sn, target);
    }

    if (numeroBox) {
      if (!labelToSerials.has(numeroBox)) labelToSerials.set(numeroBox, new Set());
      for (const sn of serials) labelToSerials.get(numeroBox).add(sn);
    }
  });

  return { serialToBox, labelToSerials, tcwById };
}

function resolveTargetFromSerials(serials, serialToBox) {
  const votes = new Map();
  for (const sn of serials) {
    const target = serialToBox.get(String(sn).toUpperCase());
    if (!target) continue;
    const norm = normalizeAppSheetBoxCode(target);
    if (norm) votes.set(norm, (votes.get(norm) || 0) + 1);
  }
  if (!votes.size) return { code: null, method: null, votes: 0 };

  const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const [best, count] = sorted[0];
  const total = serials.length;
  if (count >= Math.max(1, Math.ceil(total * 0.5))) {
    return { code: best, method: 'serial_vote', votes: count };
  }
  return { code: null, method: null, votes: count };
}

function resolvePxZonaBoxCode(legacyLabel) {
  const m = String(legacyLabel).trim().match(/^(\d+)\s+PX\s+ZONA/i);
  if (!m) return null;
  return padBoxCode(m[1]);
}

async function fetchLegacyBoxes(supabase) {
  const { data: boxes, error } = await supabase
    .from('boxes')
    .select('id, box_code, rack_location')
    .not('rack_location', 'in', '("ELIMINADO","DESPACHO")');

  if (error) throw error;

  const legacy = (boxes || []).filter((b) => !isStandardErpBoxCode(b.box_code));
  if (!legacy.length) return [];

  const ids = legacy.map((b) => b.id);
  const seriesByBox = new Map();

  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: series, error: sErr } = await supabase
      .from('series')
      .select('serial_number, current_box_id')
      .in('current_box_id', chunk);
    if (sErr) throw sErr;
    for (const s of series || []) {
      const bid = s.current_box_id;
      if (!seriesByBox.has(bid)) seriesByBox.set(bid, []);
      seriesByBox.get(bid).push(String(s.serial_number).toUpperCase());
    }
  }

  return legacy
    .filter((b) => (seriesByBox.get(b.id) || []).length > 0)
    .map((b) => ({
      ...b,
      serials: seriesByBox.get(b.id) || [],
    }));
}

async function fetchExistingBoxCodes(supabase) {
  const { data, error } = await supabase.from('boxes').select('id, box_code');
  if (error) throw error;
  const map = new Map();
  for (const b of data || []) {
    if (isStandardErpBoxCode(b.box_code)) {
      map.set(String(b.box_code).toUpperCase(), b.id);
    }
  }
  return map;
}

async function assignNextUniqueBoxCode(supabase, existingCodes) {
  let max = 0;
  for (const code of existingCodes.keys()) {
    const m = String(code).match(/^BOX-(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  for (let n = max + 1; n <= max + 50000; n++) {
    const candidate = padBoxCode(n);
    if (!existingCodes.has(candidate)) {
      existingCodes.set(candidate, '__reserved__');
      return candidate;
    }
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    const { data, error } = await supabase.rpc('next_box_code');
    if (error) throw error;
    const code = String(data).toUpperCase();
    if (!existingCodes.has(code)) {
      existingCodes.set(code, '__reserved__');
      return code;
    }
  }
  throw new Error('No se pudo reservar box_code único');
}

async function ensureLegacyColumn(supabase) {
  const { error } = await supabase.from('boxes').select('legacy_box_label').limit(1);
  if (!error) return true;

  if (!error.message?.includes('legacy_box_label')) throw error;

  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL;
  if (!dbUrl) {
    console.warn(
      'Sin columna legacy_box_label. Ejecute 068_boxes_legacy_label.sql en Supabase; se actualizará solo box_code.'
    );
    return false;
  }

  try {
    const { Client } = require('pg');
    const client = new Client({
      connectionString: dbUrl,
      ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query(`
      ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS legacy_box_label text;
    `);
    await client.end();
    console.log('Columna legacy_box_label creada.');
    return true;
  } catch (e) {
    console.warn('No se pudo crear legacy_box_label:', e.message);
    return false;
  }
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }
  if (!fs.existsSync(XLSX_PATH)) {
    console.error('No se encontró el Excel AppSheet:', XLSX_PATH);
    process.exit(1);
  }

  console.log('Leyendo AppSheet:', XLSX_PATH);
  const maps = await loadAppsheetMaps(XLSX_PATH);
  console.log('Series mapeadas en AppSheet:', maps.serialToBox.size);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const legacyBoxes = await fetchLegacyBoxes(supabase);
  console.log('Cajas legacy con inventario en ERP:', legacyBoxes.length);

  const existingCodes = await fetchExistingBoxCodes(supabase);
  const planned = [];
  const needAuto = [];

  for (const box of legacyBoxes) {
    const current = String(box.box_code || '').trim();
    let target = null;
    let method = null;

    const direct = normalizeAppSheetBoxCode(current);
    if (direct) {
      target = direct;
      method = 'direct_normalize';
    }

    if (!target) {
      const voted = resolveTargetFromSerials(box.serials, maps.serialToBox);
      if (voted.code) {
        target = voted.code;
        method = voted.method;
      }
    }

    if (!target) {
      const px = resolvePxZonaBoxCode(current);
      if (px) {
        target = px;
        method = 'px_zona_prefix';
      }
    }

    if (!target) {
      needAuto.push(box);
      continue;
    }

    const takenBy = existingCodes.get(target.toUpperCase());
    if (takenBy && takenBy !== box.id) {
      needAuto.push({ ...box, conflict: target });
      continue;
    }

    planned.push({
      id: box.id,
      from: current,
      to: target,
      method,
      serialCount: box.serials.length,
    });
    existingCodes.set(target.toUpperCase(), box.id);
  }

  let autoCodes = [];
  if (needAuto.length) {
    autoCodes = needAuto.map(() => '__NEXT__');
    needAuto.forEach((box, i) => {
      planned.push({
        id: box.id,
        from: String(box.box_code || '').trim(),
        to: autoCodes[i],
        method: box.conflict ? `conflict_fallback_was_${box.conflict}` : 'next_box_code',
        serialCount: box.serials.length,
      });
    });
  }

  const byMethod = {};
  for (const p of planned) {
    byMethod[p.method] = (byMethod[p.method] || 0) + 1;
  }

  const displayTo = (to) => (to === '__NEXT__' ? '(next_box_code)' : to);

  console.log('\n=== PLAN DE RENUMERACIÓN ===');
  console.log('Total:', planned.length);
  console.log('Por método:', byMethod);
  console.log('\nPrimeras 25:');
  planned.slice(0, 25).forEach((p) => {
    console.log(`  ${p.from} → ${displayTo(p.to)}  [${p.method}, ${p.serialCount} series]`);
  });

  const reportPath = path.join(__dirname, '../tmp/legacy_box_renumber_plan.csv');
  const csv = [
    'box_id,legacy_box_code,new_box_code,method,serial_count',
    ...planned.map(
      (p) =>
        `${p.id},"${p.from.replace(/"/g, '""')}",${displayTo(p.to)},${p.method},${p.serialCount}`
    ),
  ].join('\n');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, csv, 'utf8');
  console.log('\nPlan CSV:', reportPath);

  if (!APPLY) {
    console.log('\nDry-run. Para aplicar: node scripts/renumber_legacy_boxes_from_appsheet.js --apply');
    return;
  }

  const hasLegacyCol = await ensureLegacyColumn(supabase);

  console.log('\nAplicando actualizaciones...');
  let ok = 0;
  let fail = 0;

  for (const p of planned) {
    let targetCode = p.to;
    if (targetCode === '__NEXT__' || String(targetCode).startsWith('(next_box_code')) {
      try {
        targetCode = await assignNextUniqueBoxCode(supabase, existingCodes);
      } catch (e) {
        console.error('FAIL next_box_code for', p.from, e.message);
        fail++;
        continue;
      }
    }

    const payload = { box_code: targetCode };
    if (hasLegacyCol) payload.legacy_box_label = p.from;

    const { error } = await supabase.from('boxes').update(payload).eq('id', p.id);

    if (error) {
      console.error('FAIL', p.from, '→', targetCode, error.message);
      fail++;
    } else {
      console.log('OK', p.from, '→', targetCode);
      existingCodes.set(targetCode.toUpperCase(), p.id);
      ok++;
    }
  }

  console.log(`\nListo: ${ok} actualizadas, ${fail} errores.`);
  if (ok > 0) {
    console.log('Ejecute en Supabase: NOTIFY pgrst, \'reload schema\';');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

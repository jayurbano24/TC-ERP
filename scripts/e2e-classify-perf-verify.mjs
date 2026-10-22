/**
 * Real E2E: 9 units × 3 series against production classify API + DB asserts.
 * Does not print secrets. Cleans only synthetic rows created by this run.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const apiBase = process.env.E2E_API_BASE || 'https://tc-erp.vercel.app';

if (!url || !serviceKey || !anonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, '')
  .slice(0, 14);
const guideNumber = `E2E-TEST-${stamp}`;
const correlationId = `e2e-classify-${stamp}`;
const email = `e2e.classify.${stamp}@tc-erp.invalid`;
const password = `E2e!${randomBytes(12).toString('hex')}`;

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BRAND_ID = '99da0a2f-b41c-4502-9137-de8a6ad89fa5'; // ZTE
const MODEL_ID = '1c2773c5-1e94-444a-9d8b-7eb52d5812bd'; // ZXV10 B866V (3 series)

function unitSerials(unitIndex) {
  const base = `E2E${stamp}${String(unitIndex).padStart(2, '0')}`;
  return [`${base}S1`, `${base}S2`, `${base}S3`];
}

const units = Array.from({ length: 9 }, (_, i) => {
  const all_series = unitSerials(i + 1);
  return {
    main_serial: all_series[0],
    model_id: MODEL_ID,
    brand_id: BRAND_ID,
    all_series,
  };
});

const allSerials = units.flatMap((u) => u.all_series);

async function assertPreflight() {
  const unique = new Set(allSerials.map((s) => s.trim().toUpperCase()));
  if (unique.size !== 27) throw new Error(`Expected 27 unique series, got ${unique.size}`);
  for (const sn of unique) {
    if (sn.length < 3) throw new Error(`Invalid short serial ${sn}`);
  }
  const { data, error } = await admin
    .from('series')
    .select('serial_number')
    .in('serial_number', [...unique]);
  if (error) throw new Error(error.message);
  if ((data?.length ?? 0) > 0) {
    throw new Error(`Series already exist in prod: ${data.map((r) => r.serial_number).join(',')}`);
  }
  console.log(JSON.stringify({ preflight: 'ok', uniqueSeries: unique.size, guideNumber, correlationId }));
}

async function createTempUser() {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `E2E Classify ${stamp}` },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  const userId = created.user.id;

  const { error: profileErr } = await admin.from('profiles').upsert({
    id: userId,
    email,
    full_name: `E2E Classify ${stamp}`,
    is_active: true,
  });
  if (profileErr) throw new Error(`profiles: ${profileErr.message}`);

  const { error: roleErr } = await admin.from('user_roles').insert({ user_id: userId, role: 'receptor_cac' });
  if (roleErr) throw new Error(`user_roles: ${roleErr.message}`);
  return userId;
}

async function createReceptionContext(userId) {
  const { data: reception, error: recErr } = await admin
    .from('receptions')
    .insert({
      guide_number: guideNumber,
      status: 'EN_PROCESO',
      source: 'cac',
      received_by: userId,
      expected_units: 9,
      received_units: 9,
      notes: `synthetic ${correlationId}`,
    })
    .select('id')
    .single();
  if (recErr) throw new Error(`receptions: ${recErr.message}`);

  const { data: guide, error: gErr } = await admin
    .from('reception_guides')
    .insert({
      reception_id: reception.id,
      guide_number: guideNumber,
      category: 'equipo',
      agency: 'E2E-CAC',
    })
    .select('id')
    .single();
  if (gErr) throw new Error(`reception_guides: ${gErr.message}`);

  const sapDoc = `E2E-SAP-${stamp}`;
  const { data: sap, error: sErr } = await admin
    .from('sap_transfer_documents')
    .insert({
      reception_id: reception.id,
      reception_guide_id: guide.id,
      sap_document_number: sapDoc,
      agency: 'E2E-CAC',
      registered_by: `E2E ${stamp}`,
      status: 'PENDIENTE_INGRESO_BODEGA',
    })
    .select('id')
    .single();
  if (sErr) throw new Error(`sap_transfer_documents: ${sErr.message}`);

  return { receptionId: reception.id, guideId: guide.id, sapTransferId: sap.id, sapDoc };
}

async function signIn() {
  const browser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await browser.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn: ${error.message}`);
  return data.session.access_token;
}

async function callClassify(token, body) {
  const started = Date.now();
  const res = await fetch(`${apiBase}/api/v1/backoffice/classify-equipment-batch`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const elapsedMs = Date.now() - started;
  return { status: res.status, json, elapsedMs };
}

async function dbCounts(receptionId) {
  const { count: osCount, error: osErr } = await admin
    .from('service_orders')
    .select('id', { count: 'exact', head: true })
    .eq('reception_id', receptionId);
  if (osErr) throw new Error(osErr.message);

  const { data: orders, error: oErr } = await admin
    .from('service_orders')
    .select('id, main_serial')
    .eq('reception_id', receptionId);
  if (oErr) throw new Error(oErr.message);

  const orderIds = (orders ?? []).map((o) => o.id);
  let seriesCount = 0;
  let linkedOk = true;
  if (orderIds.length) {
    const { data: seriesRows, error: sErr } = await admin
      .from('series')
      .select('id, serial_number, service_order_id')
      .in('service_order_id', orderIds);
    if (sErr) throw new Error(sErr.message);
    seriesCount = seriesRows?.length ?? 0;
    for (const u of units) {
      const os = orders.find((o) => String(o.main_serial).toUpperCase() === u.main_serial.toUpperCase());
      if (!os) {
        linkedOk = false;
        continue;
      }
      const linked = (seriesRows ?? []).filter((s) => s.service_order_id === os.id).map((s) => s.serial_number.toUpperCase());
      for (const sn of u.all_series) {
        if (!linked.includes(sn.toUpperCase())) linkedOk = false;
      }
    }
  }

  return { osCount: osCount ?? 0, seriesCount, linkedOk, orderIds };
}

async function cleanup({ userId, receptionId, orderIds }) {
  const deleted = { series: 0, service_orders: 0, sap: 0, guides: 0, receptions: 0, user_roles: 0, users: 0 };

  if (orderIds?.length) {
    const { data: seriesRows } = await admin.from('series').select('id').in('service_order_id', orderIds);
    if (seriesRows?.length) {
      await admin.from('series').delete().in('id', seriesRows.map((s) => s.id));
      deleted.series = seriesRows.length;
    }
    await admin.from('service_orders').delete().in('id', orderIds);
    deleted.service_orders = orderIds.length;
  }

  if (receptionId) {
    await admin.from('sap_transfer_documents').delete().eq('reception_id', receptionId);
    deleted.sap = 1;
    await admin.from('reception_guides').delete().eq('reception_id', receptionId);
    deleted.guides = 1;
    await admin.from('receptions').delete().eq('id', receptionId);
    deleted.receptions = 1;
  }

  if (userId) {
    await admin.from('user_roles').delete().eq('user_id', userId);
    deleted.user_roles = 1;
    await admin.from('profiles').delete().eq('id', userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (!error) deleted.users = 1;
  }

  console.log(JSON.stringify({ cleanup: deleted, guideNumber, email }));
}

async function main() {
  let userId;
  let receptionId;
  let orderIds = [];
  try {
    await assertPreflight();
    userId = await createTempUser();
    const ctx = await createReceptionContext(userId);
    receptionId = ctx.receptionId;
    const token = await signIn();

    const payload = {
      receptionId: ctx.receptionId,
      sapTransferId: ctx.sapTransferId,
      units,
      registeredBy: `E2E ${stamp}`,
      correlationId,
    };

    const first = await callClassify(token, payload);
    console.log(JSON.stringify({
      phase: 'first',
      httpStatus: first.status,
      elapsedMs: first.elapsedMs,
      error: first.json?.error ?? null,
      unitsProcessed: first.json?.unitsProcessed ?? null,
      dataLen: Array.isArray(first.json?.data) ? first.json.data.length : 0,
    }));

    const counts1 = await dbCounts(ctx.receptionId);
    orderIds = counts1.orderIds;
    console.log(JSON.stringify({ phase: 'db_after_first', ...counts1, elapsedMs: first.elapsedMs }));

    if (first.json?.error || counts1.osCount !== 9 || counts1.seriesCount !== 27 || !counts1.linkedOk) {
      throw new Error(`Acceptance failed after first call: os=${counts1.osCount} series=${counts1.seriesCount} linked=${counts1.linkedOk} err=${first.json?.error}`);
    }
    if (first.elapsedMs >= 30_000) {
      throw new Error(`Too slow: ${first.elapsedMs}ms (>=30000)`);
    }

    const retry = await callClassify(token, payload);
    const counts2 = await dbCounts(ctx.receptionId);
    orderIds = counts2.orderIds;
    console.log(JSON.stringify({
      phase: 'retry',
      httpStatus: retry.status,
      elapsedMs: retry.elapsedMs,
      error: retry.json?.error ?? null,
      dataLen: Array.isArray(retry.json?.data) ? retry.json.data.length : 0,
      db: counts2,
    }));

    if (counts2.osCount !== 9 || counts2.seriesCount !== 27) {
      throw new Error(`Idempotency broke counts: os=${counts2.osCount} series=${counts2.seriesCount}`);
    }

    console.log(JSON.stringify({
      success: true,
      guideNumber,
      correlationId,
      firstElapsedMs: first.elapsedMs,
      retryElapsedMs: retry.elapsedMs,
      os: 9,
      series: 27,
    }));
  } finally {
    await cleanup({ userId, receptionId, orderIds });
  }
}

main().catch((err) => {
  console.error(String(err?.stack || err));
  process.exit(1);
});

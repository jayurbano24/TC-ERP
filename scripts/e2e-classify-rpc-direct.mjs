/**
 * Direct RPC timing (bypasses Vercel) for one synthetic unit.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const stamp = Date.now().toString();
const email = `e2e.rpc.${stamp}@tc-erp.invalid`;
const password = `E2e!${randomBytes(8).toString('hex')}`;
const guideNumber = `E2E-RPC-${stamp}`;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const BRAND_ID = '99da0a2f-b41c-4502-9137-de8a6ad89fa5';
const MODEL_ID = '1c2773c5-1e94-444a-9d8b-7eb52d5812bd';

async function main() {
  const { data: created, error: uErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (uErr) throw uErr;
  const userId = created.user.id;
  await admin.from('profiles').upsert({ id: userId, email, full_name: 'E2E RPC', is_active: true });
  await admin.from('user_roles').insert({ user_id: userId, role: 'receptor_cac' });

  const { data: reception } = await admin
    .from('receptions')
    .insert({
      guide_number: guideNumber,
      status: 'EN_PROCESO',
      source: 'cac',
      received_by: userId,
      expected_units: 1,
      received_units: 1,
      notes: 'rpc-direct',
    })
    .select('id')
    .single();

  const { data: guide } = await admin
    .from('reception_guides')
    .insert({
      reception_id: reception.id,
      guide_number: guideNumber,
      category: 'equipo',
      agency: 'E2E',
    })
    .select('id')
    .single();

  const { data: sap } = await admin
    .from('sap_transfer_documents')
    .insert({
      reception_id: reception.id,
      reception_guide_id: guide.id,
      sap_document_number: `E2E-RPC-SAP-${stamp}`,
      agency: 'E2E',
      registered_by: 'E2E',
      status: 'PENDIENTE_INGRESO_BODEGA',
    })
    .select('id')
    .single();

  const browser = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: session, error: sErr } = await browser.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });

  const sn = [`E2ERPC${stamp}S1`, `E2ERPC${stamp}S2`, `E2ERPC${stamp}S3`];
  const t0 = Date.now();
  const { data, error } = await userClient.rpc('classify_equipment_batch_tx', {
    p_reception_id: reception.id,
    p_sap_transfer_id: sap.id,
    p_units: [
      {
        main_serial: sn[0],
        model_id: MODEL_ID,
        brand_id: BRAND_ID,
        all_series: sn,
      },
    ],
    p_registered_by: 'E2E-RPC',
    p_correlation_id: `rpc-direct-${stamp}`,
  });
  const elapsedMs = Date.now() - t0;

  console.log(JSON.stringify({
    elapsedMs,
    error: error ? { message: error.message, code: error.code } : null,
    units_processed: data?.units_processed ?? null,
    service_orders: Array.isArray(data?.service_orders) ? data.service_orders.length : null,
    series_ids: Array.isArray(data?.series_ids) ? data.series_ids.length : null,
  }));

  // cleanup
  if (data?.service_orders?.length) {
    const ids = data.service_orders.map((o) => o.id);
    await admin.from('series').delete().in('service_order_id', ids);
    await admin.from('service_orders').delete().in('id', ids);
  }
  await admin.from('sap_transfer_documents').delete().eq('id', sap.id);
  await admin.from('reception_guides').delete().eq('id', guide.id);
  await admin.from('receptions').delete().eq('id', reception.id);
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId);

  if (error || !data?.service_orders?.length) process.exit(2);
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});

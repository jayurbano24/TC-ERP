/**
 * Gate Supabase aislado: JWT GoTrue + PostgREST + workshop_operate_batch_tx.
 * Requiere ISOLATED_SUPABASE_URL + ANON + SERVICE_ROLE (solo 127.0.0.1:54331).
 */
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';

function gitMeta() {
  try {
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const porcelain = execSync(
      'git status --porcelain -- supabase/migrations/20261022180000_ensure_normalize_equipment_serial.sql supabase/migrations/20261023175802_ensure_part_harvest_sessions.sql supabase/migrations/289_workshop_operate_batch_tx.sql scripts/workshop-operate-supabase-gate.mjs',
      { encoding: 'utf8' },
    ).trim();
    return { sha, porcelain };
  } catch {
    return { sha: 'UNKNOWN', porcelain: 'git-unavailable' };
  }
}

const { sha: GATE_GIT_SHA, porcelain: GATE_GIT_PORCELAIN } = gitMeta();
console.log(`GATE_GIT_SHA=${GATE_GIT_SHA}`);
console.log(`GATE_GIT_PORCELAIN_SCOPED=${GATE_GIT_PORCELAIN || '(empty)'}`);

const url = process.env.ISOLATED_SUPABASE_URL?.trim() || '';
const anon = process.env.ISOLATED_SUPABASE_ANON_KEY?.trim() || '';
const service = process.env.ISOLATED_SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
const dbUrl =
  process.env.ISOLATED_DATABASE_URL?.trim() ||
  'postgresql://postgres:postgres@127.0.0.1:54332/postgres';

if (!url || !anon || !service) {
  console.error('BLOCKED: missing ISOLATED_SUPABASE_*');
  process.exit(2);
}
if (/gpvocfptmsskgfpacadl/i.test(url) || /gpvocfptmsskgfpacadl/i.test(dbUrl)) {
  console.error('BLOCKED: production marker in URL');
  process.exit(2);
}
if (!/127\.0\.0\.1:54331/.test(url)) {
  console.error(`BLOCKED: unexpected API URL ${url}`);
  process.exit(2);
}

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const DIAG_REAC = '10000000-0000-4000-8000-0000000000d1';
const DIAG_HW = '10000000-0000-4000-8000-0000000000d2';
const DIAG_EMPTY = '10000000-0000-4000-8000-0000000000d3';
const REPAIR_OK = '20000000-0000-4000-8000-0000000000e1';
const REPAIR_BAD = '20000000-0000-4000-8000-0000000000e2';
const SERIES_A = '30000000-0000-4000-8000-0000000000f1';
const SERIES_B = '30000000-0000-4000-8000-0000000000f2';

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const pg = new Client({ connectionString: dbUrl });
await pg.connect();

async function ensureCatalog() {
  await pg.query(`
    INSERT INTO public.cat_diagnostics (id, name, allowed_outcomes) VALUES
      ($1, 'FRIZADO', ARRAY['reacondicionado']::text[]),
      ($2, 'NO ENCIENDE', ARRAY['reparacion','l3']::text[]),
      ($3, 'SIN CONFIG', NULL)
    ON CONFLICT (id) DO UPDATE SET allowed_outcomes = EXCLUDED.allowed_outcomes, name = EXCLUDED.name;
  `, [DIAG_REAC, DIAG_HW, DIAG_EMPTY]);

  await pg.query(`
    INSERT INTO public.cat_repairs (id, name) VALUES ($1,'Cambio board'), ($2,'Otra')
    ON CONFLICT (id) DO NOTHING;
  `, [REPAIR_OK, REPAIR_BAD]);

  await pg.query(`
    INSERT INTO public.cat_diagnostic_repairs (diagnostic_id, repair_id) VALUES ($1,$2)
    ON CONFLICT DO NOTHING;
  `, [DIAG_HW, REPAIR_OK]);
}

async function resetSeries() {
  await pg.query('TRUNCATE public.erp_audit_logs RESTART IDENTITY CASCADE');
  await pg.query('TRUNCATE public.workshop_operate_idempotency');
  await pg.query('TRUNCATE public.series CASCADE');
  await pg.query(
    `INSERT INTO public.series (id, serial_number, current_status, current_diagnostics)
     VALUES ($1,'SN-F1','in_workshop',ARRAY[]::uuid[])
     ON CONFLICT (id) DO UPDATE SET
       current_status = EXCLUDED.current_status,
       current_diagnostics = EXCLUDED.current_diagnostics`,
    [SERIES_A],
  );
}

async function signup(email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const user = data.user;
  // Isolated schema: no auth.users → profiles trigger; user_roles FK → profiles(id).
  await pg.query(
    `INSERT INTO public.profiles (id, email, full_name, is_active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, is_active = true`,
    [user.id, email, email],
  );
  return user;
}

async function login(email, password) {
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client: c, session: data.session, user: data.user };
}

async function setRole(userId, role) {
  // Real schema: UNIQUE (user_id, role) — not UNIQUE (user_id).
  await pg.query(
    `INSERT INTO public.user_roles (user_id, role) VALUES ($1, $2::public.app_role)
     ON CONFLICT (user_id, role) DO NOTHING`,
    [userId, role],
  );
}

async function rpcOperate(client, args) {
  return client.rpc('workshop_operate_batch_tx', {
    p_series_ids: args.seriesIds,
    p_action_name: args.action,
    p_result: args.result,
    p_notes: args.notes ?? '',
    p_diagnostics: args.diagnostics ?? [],
    p_operator_id: args.operatorId ?? null,
    p_operator_name: args.operatorName ?? 'gate',
    p_idempotency_key: args.idempotencyKey ?? null,
  });
}

try {
  await ensureCatalog();

  const emailA = `gate.a.${Date.now()}@example.local`;
  const emailB = `gate.b.${Date.now()}@example.local`;
  const emailNone = `gate.none.${Date.now()}@example.local`;
  const pass = 'GateTest-Pass-123!';

  const userA = await signup(emailA, pass);
  const userB = await signup(emailB, pass);
  const userNone = await signup(emailNone, pass);
  await setRole(userA.id, 'tecnico');
  await setRole(userB.id, 'tecnico');
  // userNone: sin rol

  // Auth health already implied by signup
  record('GoTrue create+login users', true, `A=${userA.id.slice(0, 8)}`);

  const loginA = await login(emailA, pass);
  const uidCheck = await loginA.client.rpc('workshop_operate_batch_tx', {
    p_series_ids: [],
    p_action_name: 'DIAGNÓSTICO INICIAL COMPLETADO',
    p_result: 'reparacion',
    p_notes: '',
    p_diagnostics: [],
    p_operator_id: userA.id,
    p_operator_name: 'gate',
    p_idempotency_key: null,
  });
  record(
    'PostgREST RPC reachable with user JWT',
    !uidCheck.error || !/JWT|auth/i.test(uidCheck.error.message),
    uidCheck.error?.message ?? 'ok empty batch',
  );

  // G2 spoof
  await resetSeries();
  const spoof = await rpcOperate(loginA.client, {
    seriesIds: [SERIES_A],
    action: 'DIAGNÓSTICO INICIAL COMPLETADO',
    result: 'reparacion',
    diagnostics: [DIAG_HW],
    operatorId: userB.id,
  });
  record('G2 reject operator spoof', !!spoof.error && /operator_id|FORBIDDEN/i.test(spoof.error.message), spoof.error?.message);

  // G2 anon
  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  const anonRes = await rpcOperate(anonClient, {
    seriesIds: [SERIES_A],
    action: 'DIAGNÓSTICO INICIAL COMPLETADO',
    result: 'reparacion',
    diagnostics: [DIAG_HW],
    operatorId: null,
  });
  record('G2 reject anonymous', !!anonRes.error, anonRes.error?.message);

  // G2 no role
  const loginNone = await login(emailNone, pass);
  const noRole = await rpcOperate(loginNone.client, {
    seriesIds: [SERIES_A],
    action: 'DIAGNÓSTICO INICIAL COMPLETADO',
    result: 'reparacion',
    diagnostics: [DIAG_HW],
    operatorId: userNone.id,
  });
  record('G2 reject user without role', !!noRole.error && /FORBIDDEN|insufficient role|permission/i.test(noRole.error.message), noRole.error?.message);

  // G2 service_role
  const svc = await rpcOperate(admin, {
    seriesIds: [SERIES_A],
    action: 'DIAGNÓSTICO INICIAL COMPLETADO',
    result: 'reparacion',
    diagnostics: [DIAG_HW],
    operatorId: userA.id,
  });
  record('G2 reject service_role mutate', !!svc.error, svc.error?.message);

  // G1
  await resetSeries();
  const g1ok = await rpcOperate(loginA.client, {
    seriesIds: [SERIES_A],
    action: 'DIAGNÓSTICO INICIAL COMPLETADO',
    result: 'reacondicionado',
    diagnostics: [DIAG_REAC],
    operatorId: userA.id,
  });
  record('G1 reacondicionado-only allows', !g1ok.error, g1ok.error?.message);

  await resetSeries();
  const g1mix = await rpcOperate(loginA.client, {
    seriesIds: [SERIES_A],
    action: 'DIAGNÓSTICO INICIAL COMPLETADO',
    result: 'reacondicionado',
    diagnostics: [DIAG_REAC, DIAG_HW],
    operatorId: userA.id,
  });
  record('G1 mixed rejects reacondicionado', !!g1mix.error && /TRANSITION_NOT_ALLOWED/i.test(g1mix.error.message), g1mix.error?.message);

  await resetSeries();
  const g1empty = await rpcOperate(loginA.client, {
    seriesIds: [SERIES_A],
    action: 'DIAGNÓSTICO INICIAL COMPLETADO',
    result: 'reacondicionado',
    diagnostics: [DIAG_EMPTY],
    operatorId: userA.id,
  });
  record('G1 empty outcomes rejects reacondicionado', !!g1empty.error && /TRANSITION_NOT_ALLOWED/i.test(g1empty.error.message), g1empty.error?.message);

  // G3 success + audit
  await resetSeries();
  const g3 = await rpcOperate(loginA.client, {
    seriesIds: [SERIES_A],
    action: 'DIAGNÓSTICO INICIAL COMPLETADO',
    result: 'reparacion',
    diagnostics: [DIAG_HW],
    operatorId: userA.id,
  });
  const st = await pg.query(`SELECT current_status FROM series WHERE id=$1`, [SERIES_A]);
  const aud = await pg.query(`SELECT count(*)::int AS n FROM erp_audit_logs WHERE record_id=$1`, [SERIES_A]);
  record('G3 transition+audit', !g3.error && st.rows[0]?.current_status === 'in_qc' && aud.rows[0].n === 1, g3.error?.message);

  // G3 invalid batch
  await resetSeries();
  await pg.query(
    `INSERT INTO public.series (id, serial_number, current_status) VALUES ($1,'SN-F2','in_qc')
     ON CONFLICT (id) DO UPDATE SET current_status='in_qc'`,
    [SERIES_B],
  );
  const g3bad = await rpcOperate(loginA.client, {
    seriesIds: [SERIES_A, SERIES_B],
    action: 'DIAGNÓSTICO INICIAL COMPLETADO',
    result: 'reparacion',
    diagnostics: [DIAG_HW],
    operatorId: userA.id,
  });
  const stA = await pg.query(`SELECT current_status FROM series WHERE id=$1`, [SERIES_A]);
  const aud2 = await pg.query(`SELECT count(*)::int AS n FROM erp_audit_logs`);
  record(
    'G3 invalid batch no partial',
    !!g3bad.error && stA.rows[0]?.current_status === 'in_workshop' && aud2.rows[0].n === 0,
    g3bad.error?.message,
  );

  // G3 audit fail rollback via trigger
  await resetSeries();
  await pg.query(`
    CREATE OR REPLACE FUNCTION public._gate_force_audit_fail() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FORCED_AUDIT_FAIL'; END $$;
    DROP TRIGGER IF EXISTS trg_gate_force_audit_fail ON public.erp_audit_logs;
    CREATE TRIGGER trg_gate_force_audit_fail BEFORE INSERT ON public.erp_audit_logs
      FOR EACH ROW EXECUTE FUNCTION public._gate_force_audit_fail();
  `);
  const g3roll = await rpcOperate(loginA.client, {
    seriesIds: [SERIES_A],
    action: 'DIAGNÓSTICO INICIAL COMPLETADO',
    result: 'reparacion',
    diagnostics: [DIAG_HW],
    operatorId: userA.id,
  });
  const stRoll = await pg.query(`SELECT current_status FROM series WHERE id=$1`, [SERIES_A]);
  const audRoll = await pg.query(`SELECT count(*)::int AS n FROM erp_audit_logs`);
  const idemRoll = await pg.query(`SELECT count(*)::int AS n FROM workshop_operate_idempotency`);
  record(
    'G3 audit failure rolls back',
    !!g3roll.error &&
      /FORCED_AUDIT_FAIL/i.test(g3roll.error.message) &&
      stRoll.rows[0]?.current_status === 'in_workshop' &&
      audRoll.rows[0].n === 0 &&
      idemRoll.rows[0].n === 0,
    g3roll.error?.message,
  );
  await pg.query(`
    DROP TRIGGER IF EXISTS trg_gate_force_audit_fail ON public.erp_audit_logs;
    DROP FUNCTION IF EXISTS public._gate_force_audit_fail();
  `);

  // G4 idempotency
  await resetSeries();
  const idem = randomUUID();
  const args = {
    seriesIds: [SERIES_A],
    action: 'DIAGNÓSTICO INICIAL COMPLETADO',
    result: 'reparacion',
    diagnostics: [DIAG_HW],
    operatorId: userA.id,
    idempotencyKey: idem,
  };
  const i1 = await rpcOperate(loginA.client, args);
  const i2 = await rpcOperate(loginA.client, args);
  const audI = await pg.query(`SELECT count(*)::int AS n FROM erp_audit_logs`);
  record('G4 idempotent retry', !i1.error && !i2.error && audI.rows[0].n === 1 && JSON.stringify(i1.data) === JSON.stringify(i2.data));

  await pg.query(`UPDATE series SET current_status='in_workshop' WHERE id=$1`, [SERIES_A]);
  const i3 = await rpcOperate(loginA.client, { ...args, result: 'l3' });
  record('G4 idempotency conflict different payload', !!i3.error && /CONFLICT|idempotency/i.test(i3.error.message), i3.error?.message);

  // G4 concurrent-ish second operator
  await resetSeries();
  const loginB = await login(emailB, pass);
  const first = await rpcOperate(loginA.client, {
    seriesIds: [SERIES_A],
    action: 'DIAGNÓSTICO INICIAL COMPLETADO',
    result: 'reparacion',
    diagnostics: [DIAG_HW],
    operatorId: userA.id,
  });
  const second = await rpcOperate(loginB.client, {
    seriesIds: [SERIES_A],
    action: 'DIAGNÓSTICO INICIAL COMPLETADO',
    result: 'l3',
    diagnostics: [DIAG_HW],
    operatorId: userB.id,
  });
  const audC = await pg.query(`SELECT count(*)::int AS n FROM erp_audit_logs`);
  record('G4 second operator CONFLICT', !first.error && !!second.error && audC.rows[0].n === 1, second.error?.message);

  // EXECUTE privileges
  const grants = await pg.query(`
    SELECT grantee::text, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema='public' AND routine_name='workshop_operate_batch_tx'
    ORDER BY 1,2
  `);
  const grantees = grants.rows.map((r) => r.grantee);
  record(
    'EXECUTE grants minimal',
    grantees.includes('authenticated') && !grantees.includes('anon') && !grantees.includes('PUBLIC'),
    grantees.join(','),
  );

  // Repair validation
  await pg.query(`UPDATE series SET current_status='in_qc', current_diagnostics=ARRAY[$1]::uuid[] WHERE id=$2`, [
    DIAG_HW,
    SERIES_A,
  ]);
  const badRep = await rpcOperate(loginA.client, {
    seriesIds: [SERIES_A],
    action: 'REPARACIÓN COMPLETADA',
    result: 'control_calidad',
    diagnostics: [REPAIR_BAD],
    operatorId: userA.id,
  });
  record('G1 repair mapping rejects bad repair', !!badRep.error && /TRANSITION_NOT_ALLOWED/i.test(badRep.error.message), badRep.error?.message);
} catch (e) {
  record('harness exception', false, e instanceof Error ? e.message : String(e));
} finally {
  await pg.end().catch(() => undefined);
}

const failed = results.filter((r) => !r.ok);
console.log('\nSUMMARY', { total: results.length, pass: results.length - failed.length, fail: failed.length });
console.log(`GATE_GIT_SHA=${GATE_GIT_SHA}`);
const exitCode = failed.length ? 1 : 0;
console.log(`GATE_EXIT=${exitCode}`);
process.exit(exitCode);

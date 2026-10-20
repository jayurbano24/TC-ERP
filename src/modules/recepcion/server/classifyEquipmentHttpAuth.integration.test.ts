import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupClassifyDataFullStack,
  RECEPTION_ID,
  SAP_TRANSFER_ID,
  seedContextFullStack,
  snapshot,
  type UnitPayload,
} from './classifyIntegrationFixtures';

const apiUrl = process.env.ISOLATED_SUPABASE_URL?.trim() || '';
const anonKey = process.env.ISOLATED_SUPABASE_ANON_KEY?.trim() || '';
const serviceRoleKey = process.env.ISOLATED_SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
const jwtSecret = process.env.ISOLATED_SUPABASE_JWT_SECRET?.trim() || '';
const dbUrl = process.env.CLASSIFY_FULL_DATABASE_URL?.trim() || '';

const enabled =
  apiUrl.length > 0 && anonKey.length > 0 && dbUrl.length > 0 && jwtSecret.length > 0;

function decodeJwtSub(accessToken: string): string {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('Invalid JWT shape');
  const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string };
  if (!json.sub) throw new Error('JWT missing sub');
  return json.sub;
}

function signHs256Jwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

type RpcPostResult = { status: number; body: unknown; errorMessage: string | null };

async function postClassifyRpcViaRest(opts: {
  authorization?: string;
  apikey?: string;
  correlationId?: string;
  unit?: UnitPayload;
}): Promise<RpcPostResult> {
  const unit = opts.unit ?? { main_serial: 'HTTP1', all_series: ['HTTP1', 'HTTP-S2'] };
  const correlationId = opts.correlationId ?? 'http-rest';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  if (opts.apikey) headers.apikey = opts.apikey;
  if (opts.authorization) headers.Authorization = opts.authorization;

  const res = await fetch(`${apiUrl}/rest/v1/rpc/classify_equipment_batch_tx`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_reception_id: RECEPTION_ID,
      p_sap_transfer_id: SAP_TRANSFER_ID,
      p_units: [unit],
      p_registered_by: 'http-rest-test',
      p_correlation_id: correlationId,
    }),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text.length ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  const errObj = body as { message?: string; error?: string; code?: string } | null;
  const errorMessage = errObj?.message ?? errObj?.error ?? (res.ok ? null : text);
  return { status: res.status, body, errorMessage };
}

async function signUpUniqueUser(suffix: string) {
  const email = `classify-http-${suffix}-${Date.now()}@tc-erp.test.local`;
  const password = 'Classify-Http-Test-9!';
  const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session?.access_token || !data.user?.id) {
    throw new Error('Expected immediate session (confirmations disabled on isolated stack)');
  }
  return { client, accessToken: data.session.access_token, userId: data.user.id, email };
}

describe.skipIf(!enabled)('classify_equipment_batch_tx HTTP auth (GoTrue + PostgREST, isolated)', () => {
  let admin: Client;
  const unit: UnitPayload = { main_serial: 'HTTP1', all_series: ['HTTP1', 'HTTP-S2'] };

  beforeAll(async () => {
    admin = new Client({ connectionString: dbUrl });
    await admin.connect();
    const { rows } = await admin.query<{ v: string }>('SELECT version() AS v');
    if (!rows[0]?.v.includes('PostgreSQL 15')) {
      throw new Error('Isolated DB must be PostgreSQL 15.x');
    }
  }, 30_000);

  beforeEach(async () => {
    await admin.query('RESET ROLE');
    await cleanupClassifyDataFullStack(admin);
    await seedContextFullStack(admin);
  });

  afterAll(async () => {
    await admin.end();
  });

  it('PostgREST: no Authorization header → rejected, no OS rows', async () => {
    const res = await postClassifyRpcViaRest({ apikey: anonKey, correlationId: 'http-no-auth' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await snapshot(admin)).os).toHaveLength(0);
  });

  it('PostgREST: malformed JWT → rejected', async () => {
    const res = await postClassifyRpcViaRest({
      apikey: anonKey,
      authorization: 'Bearer not.a.valid.jwt',
      correlationId: 'http-bad-jwt',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await snapshot(admin)).os).toHaveLength(0);
  });

  it('PostgREST: expired JWT → rejected', async () => {
    const sub = '90000000-0000-0000-0000-000000000099';
    const expired = signHs256Jwt(
      { sub, role: 'authenticated', aud: 'authenticated', exp: 1, iat: 1 },
      jwtSecret
    );
    const res = await postClassifyRpcViaRest({
      apikey: anonKey,
      authorization: `Bearer ${expired}`,
      correlationId: 'http-exp-jwt',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await snapshot(admin)).os).toHaveLength(0);
  });

  it('authenticated JWT (GoTrue) invokes RPC; domain event audit trail', async () => {
    const correlationId = `http-auth-${Date.now()}`;
    const { client, accessToken, userId } = await signUpUniqueUser('ok');
    expect(decodeJwtSub(accessToken)).toBe(userId);

    await admin.query(
      `INSERT INTO public.profiles (id, full_name, email)
       VALUES ($1, 'HTTP Classify', 'http@test.local')
       ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name`,
      [userId]
    );

    const { data, error } = await client.rpc('classify_equipment_batch_tx', {
      p_reception_id: RECEPTION_ID,
      p_sap_transfer_id: SAP_TRANSFER_ID,
      p_units: [unit],
      p_registered_by: 'http-auth-test',
      p_correlation_id: correlationId,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();

    await admin.query('RESET ROLE');
    const state = await snapshot(admin);
    expect(state.os.some((o) => o.main_serial === 'HTTP1')).toBe(true);

    const audit = await admin.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM public.domain_events
       WHERE event_type = 'equipment.batch_classified'
         AND correlation_id = $1`,
      [correlationId]
    );
    expect(Number(audit.rows[0]?.cnt ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it('anon client (apikey only) → denied without writing classify data', async () => {
    const anonClient = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
    const { error } = await anonClient.rpc('classify_equipment_batch_tx', {
      p_reception_id: RECEPTION_ID,
      p_sap_transfer_id: SAP_TRANSFER_ID,
      p_units: [unit],
      p_registered_by: 'anon',
      p_correlation_id: 'http-anon',
    });
    expect(error).toBeTruthy();
    expect(error?.message ?? '').toMatch(/Not authenticated|JWT|permission|denied/i);
    await admin.query('RESET ROLE');
    expect((await snapshot(admin)).os).toHaveLength(0);
  });

  it('service_role has EXECUTE but RPC still requires auth.uid() (no bypass)', async () => {
    if (!serviceRoleKey) {
      throw new Error('ISOLATED_SUPABASE_SERVICE_ROLE_KEY required for service_role contract test');
    }
    const svc = createClient(apiUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await svc.rpc('classify_equipment_batch_tx', {
      p_reception_id: RECEPTION_ID,
      p_sap_transfer_id: SAP_TRANSFER_ID,
      p_units: [unit],
      p_registered_by: 'service-role',
      p_correlation_id: 'http-svc',
    });
    expect(error?.message ?? '').toMatch(/Not authenticated/i);
    await admin.query('RESET ROLE');
    expect((await snapshot(admin)).os).toHaveLength(0);
  });

  it('authenticated user without ops role cannot write activity_costs (RLS 105)', async () => {
    const { client } = await signUpUniqueUser('rls');
    const { error } = await client.from('activity_costs').insert({
      name: `Forbidden-${Date.now()}`,
      cost: 1,
    });
    expect(error).toBeTruthy();
    expect(error?.code === '42501' || /permission|policy|denied/i.test(error?.message ?? '')).toBe(true);
  });
});

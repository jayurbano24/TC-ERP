import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertIsolatedSupabaseMutationAllowed,
  isKnownProductionSupabaseUrl,
} from '@/shared/testing/isolatedSupabaseGuard';

const ENV_KEYS = [
  'ISOLATED_SUPABASE_URL',
  'ISOLATED_SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'ALLOW_LIVE_DB_MUTATION',
] as const;

describe('isolatedSupabaseGuard', () => {
  const snapshot: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      snapshot[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const previous = snapshot[key];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  });

  it('detecta host productivo conocido', () => {
    expect(
      isKnownProductionSupabaseUrl('https://gpvocfptmsskgfpacadl.supabase.co'),
    ).toBe(true);
    expect(isKnownProductionSupabaseUrl('http://127.0.0.1:54321')).toBe(false);
  });

  it('rechaza mutación aunque ALLOW_LIVE_DB_MUTATION=true sin aislamiento', () => {
    process.env.ALLOW_LIVE_DB_MUTATION = 'true';
    delete process.env.ISOLATED_SUPABASE_URL;
    delete process.env.ISOLATED_SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gpvocfptmsskgfpacadl.supabase.co';

    expect(() => assertIsolatedSupabaseMutationAllowed('unit-test')).toThrow(
      /ISOLATED_SUPABASE_URL|productiva|Bloqueado/i,
    );
  });

  it('rechaza URL productiva aunque se pase como ISOLATED_*', () => {
    process.env.ISOLATED_SUPABASE_URL = 'https://gpvocfptmsskgfpacadl.supabase.co';
    process.env.ISOLATED_SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gpvocfptmsskgfpacadl.supabase.co';

    expect(() => assertIsolatedSupabaseMutationAllowed('unit-test')).toThrow(/productiva/i);
  });

  it('permite stack aislado local coherente', () => {
    process.env.ISOLATED_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.ISOLATED_SUPABASE_SERVICE_ROLE_KEY = 'isolated-service-role';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';

    const allowed = assertIsolatedSupabaseMutationAllowed('unit-test');
    expect(allowed.url).toContain('127.0.0.1');
    expect(allowed.serviceRoleKey).toBe('isolated-service-role');
  });
});

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { resolveAuthEmailRedirect } from './resolveAuthEmailRedirect';

describe('resolveAuthEmailRedirect', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('prioriza NEXT_PUBLIC_SITE_URL sobre localhost del cliente', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://erp.techcorps.com';
    const r = resolveAuthEmailRedirect('http://localhost:3000');
    expect(r.isLocalhost).toBe(false);
    expect(r.baseUrl).toBe('https://erp.techcorps.com');
    expect(r.redirectTo).toContain('https://erp.techcorps.com/auth/confirm');
    expect(r.redirectTo).toContain('next=%2Fauth%2Factualizar-password');
  });

  it('en development permite localhost (isLocalhost=false operativo)', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const r = resolveAuthEmailRedirect('http://localhost:3000');
    expect(r.baseUrl).toBe('http://localhost:3000');
    expect(r.isLocalhost).toBe(false);
    vi.unstubAllEnvs();
  });

  it('en production marca localhost si no hay URL pública', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.ALLOW_LOCALHOST_AUTH_REDIRECT;
    const r = resolveAuthEmailRedirect('http://localhost:3000');
    expect(r.isLocalhost).toBe(true);
    expect(r.baseUrl).toBe('http://localhost:3000');
    vi.unstubAllEnvs();
  });

  it('usa origen no-local del cliente si no hay env', () => {
    const r = resolveAuthEmailRedirect('https://staging.example.com');
    expect(r.isLocalhost).toBe(false);
    expect(r.baseUrl).toBe('https://staging.example.com');
  });
});

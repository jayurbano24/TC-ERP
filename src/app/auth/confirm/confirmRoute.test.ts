import { describe, expect, it, vi, beforeEach } from 'vitest';
import { sanitizeAuthRedirect } from './sanitizeAuthRedirect';
import { buildConfirmPlan } from './buildConfirmPlan';

describe('sanitizeAuthRedirect (open-redirect)', () => {
  it('acepta rutas internas relativas', () => {
    expect(sanitizeAuthRedirect('/auth/actualizar-password')).toBe(
      '/auth/actualizar-password'
    );
    expect(sanitizeAuthRedirect('/dashboard')).toBe('/dashboard');
  });

  it('rechaza URLs absolutas y protocol-relative', () => {
    expect(sanitizeAuthRedirect('https://evil.com')).toBe('/auth/actualizar-password');
    expect(sanitizeAuthRedirect('//evil.com')).toBe('/auth/actualizar-password');
    expect(sanitizeAuthRedirect('http://evil.com/phish')).toBe('/auth/actualizar-password');
  });

  it('usa fallback si next es vacío o inválido', () => {
    expect(sanitizeAuthRedirect(null)).toBe('/auth/actualizar-password');
    expect(sanitizeAuthRedirect('')).toBe('/auth/actualizar-password');
    expect(sanitizeAuthRedirect('dashboard')).toBe('/auth/actualizar-password');
  });
});

describe('confirm route OTP / PKCE contract', () => {
  type VerifyOtpArgs = { type: string; token_hash: string };

  it('elige verifyOtp con token_hash + type=invite', () => {
    const plan = buildConfirmPlan({
      token_hash: 'abc123',
      type: 'invite',
      next: '/auth/actualizar-password',
    });
    expect(plan.mode).toBe('verifyOtp');
    if (plan.mode === 'verifyOtp') {
      expect(plan.args).toEqual<VerifyOtpArgs>({
        type: 'invite',
        token_hash: 'abc123',
      });
      expect(plan.safeNext).toBe('/auth/actualizar-password');
    }
  });

  it('elige verifyOtp con type=recovery', () => {
    const plan = buildConfirmPlan({
      token_hash: 'rec-token',
      type: 'recovery',
    });
    expect(plan.mode).toBe('verifyOtp');
    if (plan.mode === 'verifyOtp') {
      expect(plan.args.type).toBe('recovery');
    }
  });

  it('usa exchangeCodeForSession cuando solo hay code (PKCE)', () => {
    const plan = buildConfirmPlan({ code: 'pkce-code-xyz' });
    expect(plan).toMatchObject({ mode: 'exchangeCode', code: 'pkce-code-xyz' });
  });

  it('marca inválido sin token_hash/type ni code', () => {
    expect(buildConfirmPlan({}).mode).toBe('invalid');
  });
});

describe('confirm route handler wiring (smoke)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exporta GET desde route.ts', async () => {
    // El módulo se implementa en el ciclo GREEN; aquí solo documentamos el contrato.
    // Si aún no existe, el import falla → RED correcto.
    const mod = await import('./route');
    expect(typeof mod.GET).toBe('function');
  });
});

import { sanitizeAuthRedirect } from './sanitizeAuthRedirect';

export type ConfirmPlan =
  | {
      mode: 'verifyOtp';
      args: { type: string; token_hash: string };
      safeNext: string;
    }
  | { mode: 'exchangeCode'; code: string; safeNext: string }
  | { mode: 'invalid'; safeNext: string };

export function buildConfirmPlan(params: {
  token_hash?: string | null;
  type?: string | null;
  code?: string | null;
  next?: string | null;
}): ConfirmPlan {
  const safeNext = sanitizeAuthRedirect(params.next);
  const tokenHash = params.token_hash?.trim() || '';
  const type = params.type?.trim() || '';
  const code = params.code?.trim() || '';

  if (tokenHash && type) {
    return { mode: 'verifyOtp', args: { type, token_hash: tokenHash }, safeNext };
  }
  if (code) {
    return { mode: 'exchangeCode', code, safeNext };
  }
  return { mode: 'invalid', safeNext };
}

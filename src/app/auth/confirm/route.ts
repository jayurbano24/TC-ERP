import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { appConfig } from '@/lib/app-config';
import { buildConfirmPlan } from './buildConfirmPlan';

/**
 * Intercambia token_hash (invite/recovery/email) o code (PKCE) por sesión en cookies
 * y redirige a /auth/actualizar-password (o `next` sanitizado).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const plan = buildConfirmPlan({
    token_hash: searchParams.get('token_hash'),
    type: searchParams.get('type'),
    code: searchParams.get('code'),
    next: searchParams.get('next'),
  });

  const invalidUrl = new URL('/?error=enlace_invalido_o_expirado', origin);

  if (plan.mode === 'invalid') {
    return NextResponse.redirect(invalidUrl);
  }

  if (!appConfig.supabase.configured) {
    return NextResponse.redirect(invalidUrl);
  }

  const redirectTo = new URL(plan.safeNext, origin);
  const response = NextResponse.redirect(redirectTo);

  const supabase = createServerClient(
    appConfig.supabase.url,
    appConfig.supabase.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  let error: { message: string } | null = null;

  if (plan.mode === 'verifyOtp') {
    const result = await supabase.auth.verifyOtp({
      type: plan.args.type as EmailOtpType,
      token_hash: plan.args.token_hash,
    });
    error = result.error;
  } else {
    const result = await supabase.auth.exchangeCodeForSession(plan.code);
    error = result.error;
  }

  if (error) {
    console.error('[auth/confirm]', error.message);
    return NextResponse.redirect(invalidUrl);
  }

  return response;
}

"use client";

import { useState, type FormEvent } from 'react';
import {
  LoginBrand,
  LoginFooter,
  LoginFormCard,
  LoginLayout,
} from '@/components/auth';
import { signInWithEmail } from '@/lib/auth';
import { resolveHomePath } from '@/lib/auth/resolveHomePath';
import { fetchAuthzMe } from '@/components/authz/AuthzProvider';
import { registerUserSession } from '@/lib/userSession';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { requestPasswordResetEmail } from '@/lib/actions/users';
import { Spinner } from '@/components/ui';
import { AlertCircle, ArrowLeft, Mail } from 'lucide-react';

function normalizeLoginEmail(raw: string): string {
  let loginIdentifier = raw.trim();
  if (loginIdentifier && !loginIdentifier.includes('@')) {
    loginIdentifier = `${loginIdentifier}@techcorps.com`;
  }
  return loginIdentifier.toLowerCase();
}

function initialLoginErrorFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const err = new URLSearchParams(window.location.search).get('error');
  if (err === 'enlace_invalido_o_expirado') {
    return 'El enlace de invitación o recuperación no es válido o ha expirado. Solicite uno nuevo.';
  }
  return '';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialLoginErrorFromUrl);
  const [mode, setMode] = useState<'login' | 'recover'>('login');
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recoverDone, setRecoverDone] = useState(false);
  const [recoverError, setRecoverError] = useState('');

  const openRecover = () => {
    setMode('recover');
    setRecoverDone(false);
    setRecoverError('');
    setRecoverEmail(normalizeLoginEmail(email) || email.trim());
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const loginIdentifier = normalizeLoginEmail(email);

      const authData = await signInWithEmail(loginIdentifier, password);

      if (authData?.user?.id) {
        // Esperar a que cookies/sesión Auth queden usables (evita bounce al login).
        const sb = getSupabaseBrowserClient();
        for (let i = 0; i < 10; i++) {
          const { data } = sb ? await sb.auth.getSession() : { data: { session: null } };
          if (data.session?.access_token) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        await registerUserSession(authData.user.id);
      }

      // Aterrizaje según permisos: técnicos → Taller; no forzar Dashboard Gerencial.
      let home = '/dashboard';
      try {
        const authz = await fetchAuthzMe();
        home = resolveHomePath(authz);
      } catch {
        home = '/produccion/taller';
      }

      // Hard navigate: evita race App Router / layout redirect("/") sin cookies.
      window.location.assign(home);
    } catch (err: unknown) {
      const raw =
        err instanceof Error ? err.message : 'Error inesperado al iniciar sesión.';
      let errorMessage = raw;
      if (raw.includes('Invalid login credentials')) {
        errorMessage =
          'Credenciales incorrectas. Por favor verifique que su usuario/correo y contraseña estén bien escritos.';
      } else if (raw.includes('Email not confirmed')) {
        errorMessage = 'Debe confirmar su correo electrónico antes de iniciar sesión.';
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleRecover = async (e: FormEvent) => {
    e.preventDefault();
    setRecoverError('');
    setRecoverDone(false);

    const targetEmail = normalizeLoginEmail(recoverEmail);
    if (!targetEmail.includes('@')) {
      setRecoverError('Ingrese un correo válido.');
      return;
    }

    setRecoverLoading(true);
    try {
      // generateLink + Resend en servidor (sin correo built-in de Auth / cuota).
      // Respuesta siempre genérica: no revelar si el correo existe.
      await requestPasswordResetEmail(
        targetEmail,
        typeof window !== 'undefined' ? window.location.origin : undefined
      );
      setRecoverDone(true);
    } catch (err: unknown) {
      console.error('[recover]', err);
      setRecoverDone(true);
    } finally {
      setRecoverLoading(false);
    }
  };

  return (
    <LoginLayout
      brand={<LoginBrand />}
      footer={<LoginFooter />}
    >
      {mode === 'login' ? (
        <LoginFormCard
          email={email}
          password={password}
          showPassword={showPassword}
          loading={loading}
          error={error}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onTogglePassword={() => setShowPassword((v) => !v)}
          onSubmit={handleLogin}
          forgotPasswordSlot={
            <button
              type="button"
              className="text-xs font-semibold text-accent hover:underline"
              onClick={openRecover}
            >
              ¿Olvidó su contraseña?
            </button>
          }
        />
      ) : (
        <div className="rounded-[1.2rem] border border-border bg-surface p-6 shadow-[var(--card-shadow)] sm:p-8">
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setMode('login')}
              className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Volver al inicio de sesión
            </button>
            <h1 className="text-xl font-bold text-heading">Recuperar contraseña</h1>
            <p className="mt-1 text-sm text-muted">
              Te enviaremos un enlace para restablecer el acceso.
            </p>
          </div>

          {recoverDone ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-success/25 bg-success/10 p-4 text-sm font-medium leading-snug text-heading">
                Si el correo está registrado, recibirás un enlace para restablecer tu
                contraseña.
              </div>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="flex h-14 w-full items-center justify-center rounded-xl bg-accent text-base font-bold text-accent-foreground transition-transform hover:bg-accent/90 active:scale-[0.98]"
              >
                Volver al Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleRecover} className="space-y-5" noValidate>
              <div className="space-y-2">
                <label
                  htmlFor="recover-email"
                  className="block px-0.5 text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted"
                    aria-hidden
                  />
                  <input
                    id="recover-email"
                    type="email"
                    value={recoverEmail}
                    onChange={(e) => setRecoverEmail(e.target.value)}
                    placeholder="nombre@techcorps.com"
                    className="h-14 w-full rounded-xl border border-border bg-surface-hover pl-12 pr-4 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus:bg-surface"
                    required
                    autoComplete="email"
                    disabled={recoverLoading}
                    autoFocus
                  />
                </div>
              </div>

              {recoverError ? (
                <div
                  className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/10 p-4"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                  <p className="text-sm font-medium leading-snug text-danger">{recoverError}</p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={recoverLoading}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-bold text-accent-foreground transition-transform hover:bg-accent/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
              >
                {recoverLoading ? <Spinner size="sm" /> : 'Enviar enlace'}
              </button>
            </form>
          )}
        </div>
      )}
    </LoginLayout>
  );
}

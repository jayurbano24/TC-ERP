'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, Eye, EyeOff, Lock } from 'lucide-react';
import {
  LoginBrand,
  LoginFooter,
  LoginLayout,
} from '@/components/auth';
import { Spinner } from '@/components/ui';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { resolveHomePath } from '@/lib/auth/resolveHomePath';
import { fetchAuthzMe } from '@/components/authz/AuthzProvider';
import { registerUserSession } from '@/lib/userSession';
import { markCurrentUserInvitationAccepted } from '@/lib/actions/userInvitations';

const inputClass =
  'h-14 w-full rounded-xl border border-border bg-surface-hover pl-12 pr-12 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus:bg-surface';

export default function ActualizarPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;

    // Si el redirect PKCE aterriza aquí con ?code=, pásalo por /auth/confirm (cookies SSR).
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      const next = encodeURIComponent('/auth/actualizar-password');
      window.location.replace(
        `/auth/confirm?code=${encodeURIComponent(code)}&next=${next}`
      );
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      queueMicrotask(() => {
        if (!cancelled) {
          setHasSession(false);
          setCheckingSession(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const refreshSessionFlag = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setHasSession(Boolean(data.user?.id));
      setCheckingSession(false);
    };

    void refreshSessionFlag();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // Hash recovery/invite: ACCESS_TOKEN en #access_token&type=recovery|invite
      if (
        event === 'PASSWORD_RECOVERY' ||
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        void refreshSessionFlag();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Supabase no está configurado.');
      return;
    }

    setLoading(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user?.id) {
        setError('No hay una sesión activa. Solicite un nuevo enlace o inicie sesión.');
        setLoading(false);
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError(updateErr.message || 'No se pudo actualizar la contraseña.');
        setLoading(false);
        return;
      }

      await markCurrentUserInvitationAccepted().catch(() => null);

      setSuccess('Contraseña actualizada. Redirigiendo…');
      await registerUserSession(userData.user.id);

      let home = '/dashboard';
      try {
        const authz = await fetchAuthzMe();
        home = resolveHomePath(authz);
      } catch {
        home = '/dashboard';
      }

      window.location.assign(home);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
      setLoading(false);
    }
  };

  return (
    <LoginLayout brand={<LoginBrand />} footer={<LoginFooter />}>
      <div className="rounded-[1.2rem] border border-border bg-surface p-6 shadow-[var(--card-shadow)] sm:p-8">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-heading">Definir contraseña</h1>
          <p className="mt-1 text-sm text-muted">
            Cree o actualice su contraseña de acceso al sistema.
          </p>
        </div>

        {checkingSession ? (
          <div className="flex justify-center py-10">
            <Spinner size="sm" />
          </div>
        ) : !hasSession ? (
          <div className="space-y-5">
            <div
              className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/10 p-4"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
              <p className="text-sm font-medium leading-snug text-danger">
                El enlace no es válido, expiró o aún no hay sesión. Solicite una nueva
                invitación o use &quot;Olvidé mi contraseña&quot; en el login.
              </p>
            </div>
            <Link
              href="/"
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-bold text-accent-foreground transition-transform hover:bg-accent/90 active:scale-[0.98]"
            >
              Volver al Login
              <ChevronRight className="h-5 w-5" aria-hidden />
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <label
                htmlFor="new-password"
                className="block px-0.5 text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Nueva contraseña
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted"
                  aria-hidden
                />
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className={inputClass}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-3 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:text-accent"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="confirm-password"
                className="block px-0.5 text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Confirmar contraseña
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted"
                  aria-hidden
                />
                <input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repita la contraseña"
                  className={inputClass}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute top-1/2 right-3 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:text-accent"
                  aria-label={showConfirm ? 'Ocultar confirmación' : 'Mostrar confirmación'}
                  disabled={loading}
                >
                  {showConfirm ? (
                    <EyeOff className="h-5 w-5" aria-hidden />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden />
                  )}
                </button>
              </div>
            </div>

            {error ? (
              <div
                className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/10 p-4"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                <p className="text-sm font-medium leading-snug text-danger">{error}</p>
              </div>
            ) : null}

            {success ? (
              <p className="rounded-xl border border-success/25 bg-success/10 p-4 text-sm font-medium text-success">
                {success}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-bold text-accent-foreground transition-transform hover:bg-accent/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
            >
              {loading ? (
                <Spinner size="sm" />
              ) : (
                <>
                  Guardar contraseña
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </LoginLayout>
  );
}

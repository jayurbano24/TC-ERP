'use client';

import type { FormEvent, ReactNode } from 'react';
import {
  AlertCircle,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  User,
} from 'lucide-react';
import { Spinner } from '@/components/ui';

type LoginFormCardProps = {
  email: string;
  password: string;
  showPassword: boolean;
  loading: boolean;
  error: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSubmit: (e: FormEvent) => void;
  forgotPasswordSlot?: ReactNode;
};

const inputClass =
  'h-14 w-full rounded-xl border border-border bg-surface-hover pl-12 pr-4 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus:bg-surface';

export function LoginFormCard({
  email,
  password,
  showPassword,
  loading,
  error,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onSubmit,
  forgotPasswordSlot,
}: LoginFormCardProps) {
  return (
    <div className="rounded-[1.2rem] border border-border bg-surface p-6 shadow-[var(--card-shadow)] sm:p-8">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-heading">Bienvenido de nuevo</h1>
        <p className="mt-1 text-sm text-muted">
          Ingrese sus credenciales para acceder al sistema.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="space-y-2">
          <label
            htmlFor="login-email"
            className="block px-0.5 text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Usuario / Email
          </label>
          <div className="relative">
            <User
              className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              id="login-email"
              type="text"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="nombre@techcorps.com"
              className={inputClass}
              required
              autoComplete="username"
              autoFocus
              aria-invalid={Boolean(error)}
              disabled={loading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 px-0.5">
            <label
              htmlFor="login-password"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Contraseña
            </label>
            {forgotPasswordSlot ?? (
              <a
                href="#"
                className="text-xs font-semibold text-accent hover:underline"
                onClick={(e) => e.preventDefault()}
              >
                ¿Olvidó su contraseña?
              </a>
            )}
          </div>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="••••••••••••"
              className={`${inputClass} pr-12`}
              required
              autoComplete="current-password"
              aria-invalid={Boolean(error)}
              disabled={loading}
            />
            <button
              type="button"
              onClick={onTogglePassword}
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

        {error ? (
          <div
            className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/10 p-4"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            <p className="text-sm font-medium leading-snug text-danger">{error}</p>
          </div>
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
              Iniciar Sesión
              <ChevronRight className="h-5 w-5" aria-hidden />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

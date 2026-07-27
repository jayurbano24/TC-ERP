"use client";

import { useState } from 'react';
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

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let loginIdentifier = email.trim();
      if (!loginIdentifier.includes('@')) {
        loginIdentifier = `${loginIdentifier}@techcorps.com`;
      }

      const authData = await signInWithEmail(loginIdentifier, password);

      if (authData?.user?.id) {
        // Esperar a que cookies/sesión Auth queden usables (evita bounce al login).
        const { getSupabaseBrowserClient } = await import('@/lib/supabase/client');
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

  return (
    <LoginLayout
      brand={<LoginBrand />}
      footer={<LoginFooter />}
    >
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
      />
    </LoginLayout>
  );
}

"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LoginBrand,
  LoginFooter,
  LoginFormCard,
  LoginLayout,
} from '@/components/auth';
import { signInWithEmail } from '@/lib/auth';
import { registerUserSession } from '@/lib/userSession';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

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
        await registerUserSession(authData.user.id);
      }

      router.push('/dashboard');
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

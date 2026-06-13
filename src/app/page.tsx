"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Lock, ShieldCheck, ChevronRight, LogIn, Fingerprint, Eye, EyeOff } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { signInWithEmail } from '@/lib/auth';

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
      
      if (authData?.user?.id && authData.user.id !== 'dev-user') {
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: authData.user.id })
        });
        const sessionData = await res.json();
        if (sessionData.sessionId) {
          localStorage.setItem('tcerp_session_id', sessionData.sessionId);
        }
      }

      router.push('/dashboard');
    } catch (err: any) {
      let errorMessage = err.message || 'Error inesperado al iniciar sesión.';
      if (errorMessage.includes('Invalid login credentials')) {
        errorMessage = 'Credenciales incorrectas. Por favor verifique que su usuario/correo y contraseña estén bien escritos.';
      } else if (errorMessage.includes('Email not confirmed')) {
        errorMessage = 'Debe confirmar su correo electrónico antes de iniciar sesión.';
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)] font-sans relative overflow-hidden transition-colors duration-500">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#2ec4f1] opacity-[0.05] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#181c3a] opacity-[0.2] blur-[120px] rounded-full" />
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none" 
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #ffffff 1px, transparent 0)', backgroundSize: '40px 40px' }} 
        />
      </div>

      <main className="w-full max-w-lg p-6 relative z-10 animate-rise-in mt-8">
        {/* Logo & Brand */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center mb-8">
            <svg viewBox="0 0 565 280" xmlns="http://www.w3.org/2000/svg" className="w-48 h-auto drop-shadow-lg">
              {/* Fondo transparente para no tener caja blanca */}
              <rect width="565" height="280" fill="transparent"/>
              {/* Letra T */}
              <g fill="#2e3165">
                <rect x="8" y="9" width="232" height="60"/>
                <rect x="92" y="9" width="65" height="271"/>
              </g>
              {/* Letra C */}
              <g fill="#2e3165">
                <circle cx="425" cy="140" r="140"/>
                {/* Usamos el color de fondo dinámico de la app en lugar de blanco puro */}
                <circle cx="425" cy="140" r="85" fill="var(--background)"/>
                <rect x="500" y="100" width="80" height="60" fill="var(--background)"/>
                <circle cx="425" cy="140" r="35" fill="#2e3165"/>
              </g>
            </svg>
          </div>
          <p className="text-[var(--muted)] font-medium text-sm">Enterprise Resource Planning & HRMS</p>
        </div>

        <div className="relative">
            <div className="bg-[var(--surface)] border border-[var(--border)] backdrop-blur-2xl p-10 rounded-[2.5rem] shadow-[var(--card-shadow)] transition-all animate-in fade-in zoom-in-95">
              <div className="mb-10 flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">Bienvenido de nuevo</h2>
                  <p className="text-sm text-[var(--muted)]">Ingrese sus credenciales para acceder al sistema.</p>
                </div>
                <Link href="/kiosko" title="Abrir Reloj Marcador" className="bg-[#2ec4f1]/10 text-[#2ec4f1] hover:bg-[#2ec4f1]/20 p-3 rounded-2xl transition-colors">
                  <Fingerprint className="w-6 h-6" />
                </Link>
              </div>

              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">Usuario / Email</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-[#2ec4f1] transition-colors" />
                    <input 
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nombre@techcorps.com"
                      className="w-full h-14 pl-12 pr-4 bg-[var(--surface-hover)] border border-[var(--border)] rounded-2xl text-[var(--foreground)] text-sm font-medium outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all placeholder:text-[var(--muted)]"
                      required
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Contraseña</label>
                    <a href="#" className="text-[10px] font-bold text-[#2ec4f1] hover:underline">¿Olvidó su contraseña?</a>
                  </div>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-[#2ec4f1] transition-colors" />
                    <input 
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full h-14 pl-12 pr-12 bg-[var(--surface-hover)] border border-[var(--border)] rounded-2xl text-[var(--foreground)] text-sm font-medium outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all placeholder:text-[var(--muted)]"
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#2ec4f1] transition-colors focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl flex items-start gap-3 animate-shake">
                    <Lock className="w-4 h-4 text-rose-500 mt-0.5" />
                    <p className="text-xs font-bold text-rose-500 leading-tight">{error}</p>
                  </div>
                )}

                <Button 
                  type="submit"
                  variant="primary" 
                  className="w-full h-14 bg-[var(--accent)] hover:scale-[1.02] active:scale-[0.98] text-[var(--primary-foreground)] rounded-2xl text-base font-black shadow-xl shadow-[var(--accent)]/20 flex items-center justify-center gap-2 group transition-all"
                  disabled={loading}
                >
                  {loading ? <Spinner size="sm" /> : (
                    <>
                      Iniciar Sesión
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
              </form>
            </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center space-y-6">
          <div className="flex items-center justify-center gap-2 text-slate-500 text-xs font-medium">
            <ShieldCheck className="w-4 h-4 text-[#2ec4f1]" />
            Acceso Seguro con Encriptación End-to-End
          </div>
          <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">
            © 2026 Tech Corps Multimedia • v2.4.0
          </p>
        </div>
      </main>
    </div>
  );
}

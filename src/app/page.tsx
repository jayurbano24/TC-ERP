"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Lock, ShieldCheck, ChevronRight, LogIn, Fingerprint } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { signInWithEmail } from '@/lib/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-tr from-[var(--primary)] to-[var(--accent)] rounded-[2rem] shadow-2xl shadow-[var(--accent)]/20 p-[1px] mb-8">
            <div className="w-full h-full bg-[var(--background)] rounded-[1.9rem] flex items-center justify-center">
              <span className="text-2xl font-black tracking-tighter text-[var(--accent)]">TC</span>
            </div>
          </div>
          <h1 className="text-4xl font-black text-[var(--foreground)] tracking-tight mb-3">TC–ERP</h1>
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
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full h-14 pl-12 pr-4 bg-[var(--surface-hover)] border border-[var(--border)] rounded-2xl text-[var(--foreground)] text-sm font-medium outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all placeholder:text-[var(--muted)]"
                      required
                    />
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

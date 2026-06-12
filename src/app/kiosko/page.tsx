"use client";

import { useState, useEffect } from 'react';
import { BiometricKiosk } from '@/components/BiometricKiosk';
import { ShieldCheck, ArrowLeft, Clock, Lock } from 'lucide-react';
import Link from 'next/link';

export default function KioskoPage() {
  const [time, setTime] = useState<Date | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const auth = localStorage.getItem('kiosk_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
    setTime(new Date());
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '1234') { // PIN de seguridad para autorizar el dispositivo
      localStorage.setItem('kiosk_auth', 'true');
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('PIN de seguridad incorrecto.');
      setPin('');
    }
  };

  const lockDevice = () => {
    localStorage.removeItem('kiosk_auth');
    setIsAuthenticated(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B0F19] font-sans relative overflow-hidden transition-colors duration-500">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#2ec4f1] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500 opacity-[0.03] blur-[120px] rounded-full" />
        <div 
          className="absolute inset-0 opacity-[0.02] pointer-events-none" 
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #ffffff 1px, transparent 0)', backgroundSize: '40px 40px' }} 
        />
      </div>

      <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20">
        <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-[10px] sm:text-xs font-bold uppercase tracking-widest bg-slate-800/40 hover:bg-slate-800/80 px-4 py-2 sm:py-2.5 rounded-xl backdrop-blur-md border border-slate-700/50">
          <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Volver al ERP</span>
        </Link>
      </div>

      <main className="w-full max-w-2xl p-4 sm:p-6 md:p-8 relative z-10 animate-rise-in mt-12 sm:mt-4 flex flex-col items-center">
        
        {!isAuthenticated ? (
          <div className="w-full max-w-sm mt-12 bg-slate-900/80 p-8 rounded-[2rem] border border-slate-800 backdrop-blur-xl shadow-2xl">
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-[#2ec4f1]/10 rounded-full flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-[#2ec4f1]" />
              </div>
              <h2 className="text-2xl font-black text-white text-center">Modo Kiosko</h2>
              <p className="text-sm text-slate-400 text-center mt-2">Ingrese el PIN de administración para activar esta terminal biométrica.</p>
            </div>

            <form onSubmit={handlePinSubmit} className="space-y-6">
              <div>
                <input 
                  type="password" 
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  maxLength={4}
                  className="w-full h-16 bg-slate-950 border border-slate-800 rounded-2xl text-center text-3xl text-white font-black tracking-[0.5em] focus:border-[#2ec4f1] outline-none transition-colors"
                  autoFocus
                />
              </div>

              {error && <p className="text-rose-500 text-xs font-bold text-center">{error}</p>}

              <button type="submit" className="w-full h-14 bg-[#2ec4f1] hover:bg-[#2ec4f1]/80 text-slate-950 font-black rounded-xl transition-colors">
                Activar Dispositivo
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Header con Reloj Vivo */}
            <div className="mb-6 sm:mb-10 text-center w-full flex flex-col items-center relative">
              <button onClick={lockDevice} className="absolute right-0 top-0 text-slate-600 hover:text-rose-500 transition-colors" title="Bloquear Terminal">
                <Lock className="w-5 h-5" />
              </button>
              
              <div className="inline-flex items-center justify-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/50 border border-slate-700/50 mb-4 sm:mb-6 backdrop-blur-md">
                 <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                 <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-300">Terminal Kiosko Activa</span>
              </div>

          <h1 className="text-5xl sm:text-7xl md:text-8xl font-black text-white tracking-tighter mb-1 sm:mb-2 font-mono tabular-nums drop-shadow-2xl">
            {time ? time.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: true }) : '00:00'}
          </h1>
          <p className="text-slate-400 font-bold text-xs sm:text-sm md:text-base tracking-widest uppercase flex items-center justify-center gap-2">
            <Clock className="w-4 h-4 text-[#2ec4f1]" />
            {time ? time.toLocaleDateString('es-GT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Cargando fecha...'}
          </p>
        </div>

        {/* Kiosko Component */}
        <div className="relative w-full animate-in fade-in zoom-in-95 duration-700">
           {/* Glow behind the kiosk */}
           <div className="absolute inset-0 bg-[#2ec4f1]/5 blur-3xl rounded-full transform scale-110" />
            <div className="relative z-10 w-full max-w-md mx-auto">
              <BiometricKiosk />
            </div>
          </div>
          </>
        )}

        <div className="mt-8 sm:mt-12 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-slate-500 text-[10px] sm:text-xs font-medium bg-slate-900/50 inline-flex px-4 py-2 rounded-full border border-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Acceso Seguro con Encriptación End-to-End
          </div>
        </div>
      </main>
    </div>
  );
}

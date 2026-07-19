"use client";

import { useState, useEffect } from 'react';
import { BiometricKiosk } from '@/components/BiometricKiosk';
import {
  KioskLayout,
  KioskPinGate,
  KioskClockHeader,
} from '@/components/kiosk';
import { useTheme } from '@/components/theme-provider';
import { ShieldCheck } from 'lucide-react';

export default function KioskoPage() {
  const { seasonId } = useTheme();
  const lightOnDark = seasonId === 'autumn' || seasonId === 'christmas';
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
    if (pin === '1234') {
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
    <KioskLayout
      showBackToLogin
      header={
        isAuthenticated ? (
          <KioskClockHeader time={time} onLock={lockDevice} />
        ) : undefined
      }
      footer={
        <div className="mt-8 flex justify-center sm:mt-10">
          <div
            className={[
              'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium shadow-sm backdrop-blur-md',
              lightOnDark
                ? 'border-white/30 bg-black/25 text-white'
                : 'border-white/50 bg-white/40 text-neutral-800',
            ].join(' ')}
          >
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
            Acceso Seguro con Encriptación End-to-End
          </div>
        </div>
      }
    >
      {!isAuthenticated ? (
        <KioskPinGate
          pin={pin}
          error={error}
          onPinChange={setPin}
          onSubmit={handlePinSubmit}
        />
      ) : (
        <div className="relative w-full max-w-4xl">
          <BiometricKiosk />
        </div>
      )}
    </KioskLayout>
  );
}

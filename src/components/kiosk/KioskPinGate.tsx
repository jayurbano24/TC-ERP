import type { FormEvent } from 'react';
import { Lock } from 'lucide-react';

type KioskPinGateProps = {
  pin: string;
  error: string;
  onPinChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
};

export function KioskPinGate({ pin, error, onPinChange, onSubmit }: KioskPinGateProps) {
  return (
    <div className="mt-8 w-full max-w-sm rounded-2xl border border-white/50 bg-white/45 p-8 shadow-xl backdrop-blur-md">
      <div className="mb-8 flex flex-col items-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15">
          <Lock className="h-8 w-8 text-accent" aria-hidden />
        </div>
        <h2 className="text-center text-2xl font-bold text-neutral-900">Modo Kiosko</h2>
        <p className="mt-2 text-center text-sm text-neutral-600">
          Ingrese el PIN de administración para activar esta terminal biométrica.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <label className="sr-only" htmlFor="kiosk-device-pin">
          PIN de administración
        </label>
        <input
          id="kiosk-device-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => onPinChange(e.target.value)}
          placeholder="••••"
          maxLength={4}
          autoFocus
          className="h-16 w-full rounded-xl border border-neutral-300 bg-neutral-50 text-center text-3xl font-bold tracking-[0.5em] text-neutral-900 outline-none transition-colors focus:border-accent"
        />

        {error ? (
          <p className="text-center text-xs font-semibold text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="flex h-14 w-full items-center justify-center rounded-xl bg-accent text-base font-bold text-accent-foreground transition-colors hover:bg-accent/90 active:scale-[0.98]"
        >
          Activar Dispositivo
        </button>
      </form>
    </div>
  );
}

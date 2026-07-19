import { User } from 'lucide-react';
import type { IntentOption } from '@/lib/attendance-engine';

type KioskIntentConfirmProps = {
  employeeName: string;
  prompt: string;
  options: IntentOption[];
  onSelect: (option: IntentOption) => void;
  onCancel: () => void;
};

export function KioskIntentConfirm({
  employeeName,
  prompt,
  options,
  onSelect,
  onCancel,
}: KioskIntentConfirmProps) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[var(--sidebar)]/95 p-6 backdrop-blur-md animate-in fade-in zoom-in-95">
      <div className="mb-6 flex w-full max-w-md flex-col items-center rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-accent/15">
          <User className="h-10 w-10 text-accent" aria-hidden />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Confirmar empleado</p>
        <h2 className="mt-1 text-center text-2xl font-bold capitalize text-white">
          {employeeName}
        </h2>
        <p className="mt-3 text-center text-sm text-white/70">{prompt}</p>
      </div>

      <div className="grid w-full max-w-md grid-cols-1 gap-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt)}
            className="min-h-16 w-full rounded-xl border border-white/15 bg-white/10 px-5 py-4 text-left text-base font-bold text-white transition-colors hover:border-accent/50 hover:bg-accent/20"
          >
            <span className="block text-xs font-semibold uppercase tracking-wide text-accent/90">
              Tipo de marcaje
            </span>
            <span className="mt-0.5 block">{opt.label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="mt-8 min-h-11 text-xs font-semibold uppercase tracking-wide text-white/50 underline transition-colors hover:text-white"
      >
        Cancelar y Cerrar
      </button>
    </div>
  );
}

import { Hash, ScanFace } from 'lucide-react';

type KioskEntryMenuProps = {
  welcomeMessage: string;
  onFacePunch: () => void;
  onCodeEntry: () => void;
};

export function KioskEntryMenu({
  welcomeMessage,
  onFacePunch,
  onCodeEntry,
}: KioskEntryMenuProps) {
  return (
    <>
      <div className="mb-3 text-center">
        <p className="text-xl font-bold tracking-wide text-neutral-900 uppercase">
          {welcomeMessage}
        </p>
      </div>
      <p className="mb-6 text-center text-sm font-medium leading-relaxed text-neutral-600">
        Elija cómo desea{' '}
        <span className="font-semibold text-neutral-900">marcar su asistencia</span>.
      </p>
      <button
        type="button"
        onClick={onFacePunch}
        className="mb-3 flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-accent text-lg font-bold text-accent-foreground transition-transform hover:bg-accent/90 active:scale-[0.98]"
      >
        <ScanFace className="h-7 w-7" aria-hidden />
        Reconocimiento Facial
      </button>
      <button
        type="button"
        onClick={onCodeEntry}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-white/60 bg-white/50 text-sm font-semibold text-neutral-900 backdrop-blur-sm transition-colors hover:bg-white/70"
      >
        <Hash className="h-5 w-5 text-accent" aria-hidden />
        Usar código de empleado
      </button>
    </>
  );
}

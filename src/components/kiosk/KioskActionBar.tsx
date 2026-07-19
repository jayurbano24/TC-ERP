import { AlertCircle, Camera, ShieldAlert } from 'lucide-react';

type KioskActionBarProps = {
  showSpecial: boolean;
  specialActive: boolean;
  /** Outside configured permission window — still clickable to explain why. */
  specialOutsideWindow?: boolean;
  specialTitle?: string;
  showEnroll: boolean;
  showCloseCamera: boolean;
  onSpecial: () => void;
  onEnroll: () => void;
  onCloseCamera: () => void;
};

const chipBase =
  'absolute z-30 flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-wide shadow-sm backdrop-blur-md transition-colors';

export function KioskActionBar({
  showSpecial,
  specialActive,
  specialOutsideWindow = false,
  specialTitle,
  showEnroll,
  showCloseCamera,
  onSpecial,
  onEnroll,
  onCloseCamera,
}: KioskActionBarProps) {
  return (
    <>
      {showSpecial ? (
        <button
          type="button"
          onClick={onSpecial}
          title={specialTitle}
          aria-label={specialTitle || 'Marcaje especial'}
          className={`top-4 right-4 ${chipBase} ${
            specialActive
              ? 'border-accent bg-accent text-accent-foreground'
              : specialOutsideWindow
                ? 'border-white/30 bg-white/20 text-neutral-400'
                : 'border-white/50 bg-white/40 text-neutral-800 hover:bg-white/55 hover:text-neutral-950'
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Marcaje Especial
        </button>
      ) : null}

      {showEnroll ? (
        <button
          type="button"
          onClick={onEnroll}
          className={`top-4 left-4 ${chipBase} border-white/50 bg-white/40 text-neutral-800 hover:bg-white/55 hover:text-neutral-950`}
        >
          <Camera className="h-3.5 w-3.5" aria-hidden /> Registrar Rostro
        </button>
      ) : null}

      {showCloseCamera ? (
        <button
          type="button"
          onClick={onCloseCamera}
          className={`top-4 left-4 ${chipBase} border-danger/30 bg-danger/10 text-danger hover:bg-danger/20`}
        >
          <AlertCircle className="h-3.5 w-3.5" aria-hidden /> Cerrar Cámara
        </button>
      ) : null}
    </>
  );
}

import { AlertCircle, Camera, CheckCircle2, Loader2 } from 'lucide-react';

type MatchStatus = 'idle' | 'success' | 'error' | 'verifying';

type KioskStatusBannerProps = {
  matchStatus: MatchStatus;
  title: string;
  subtitle: string;
};

/** Pie de estado translúcido para que se vea el fondo de temporada. */
const BANNER: Record<MatchStatus, string> = {
  idle: 'border-white/40 bg-white/40 text-neutral-900 backdrop-blur-md',
  success: 'border-success/40 bg-success/20 text-success backdrop-blur-md',
  error: 'border-danger/40 bg-danger/20 text-danger backdrop-blur-md',
  verifying: 'border-accent/40 bg-accent/20 text-neutral-900 backdrop-blur-md',
};

export function KioskStatusBanner({ matchStatus, title, subtitle }: KioskStatusBannerProps) {
  return (
    <div
      className={`absolute bottom-0 left-0 flex w-full items-center gap-4 border-t p-5 sm:p-6 transition-all duration-300 ${BANNER[matchStatus]}`}
      role="status"
      aria-live="polite"
    >
      {matchStatus === 'idle' && (
        <Camera className="h-7 w-7 shrink-0 text-neutral-600" aria-hidden />
      )}
      {matchStatus === 'verifying' && (
        <Loader2 className="h-7 w-7 shrink-0 animate-spin text-accent" aria-hidden />
      )}
      {matchStatus === 'success' && (
        <CheckCircle2 className="h-7 w-7 shrink-0 text-success" aria-hidden />
      )}
      {matchStatus === 'error' && (
        <AlertCircle className="h-7 w-7 shrink-0 text-danger" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wide text-neutral-600">{title}</p>
        <h3 className="truncate text-base font-bold leading-tight text-neutral-900 sm:text-lg">
          {subtitle}
        </h3>
      </div>
    </div>
  );
}

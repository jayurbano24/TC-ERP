type FaceStatus = 'searching' | 'adjusting' | 'ready' | 'capturing' | 'unknown';

type KioskFaceGuideProps = {
  faceStatus: FaceStatus;
  statusMessage?: string;
  showStatusMessage?: boolean;
};

const STATUS_LABEL: Record<FaceStatus, string> = {
  searching: 'Buscando rostro',
  adjusting: 'Ajustando captura',
  unknown: 'Rostro desconocido',
  ready: 'Rostro listo',
  capturing: 'Capturando...',
};

const RING: Record<FaceStatus, string> = {
  searching: 'border-danger',
  adjusting: 'border-warning',
  unknown: 'border-warning',
  ready: 'border-success',
  capturing: 'border-success',
};

const BADGE: Record<FaceStatus, string> = {
  searching: 'bg-danger/90 text-white',
  adjusting: 'bg-warning/90 text-[var(--sidebar)]',
  unknown: 'bg-warning/90 text-[var(--sidebar)]',
  ready: 'bg-success/90 text-white',
  capturing: 'bg-success/90 text-white',
};

export function KioskFaceGuide({
  faceStatus,
  statusMessage,
  showStatusMessage = false,
}: KioskFaceGuideProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className={`flex h-72 w-72 flex-col items-center justify-end gap-2 rounded-full border-[6px] pb-6 transition-colors duration-300 ${RING[faceStatus]}`}
      >
        <span
          className={`rounded-lg px-4 py-1.5 text-xs font-bold uppercase tracking-wide backdrop-blur-md ${BADGE[faceStatus]}`}
        >
          {STATUS_LABEL[faceStatus]}
        </span>
        {showStatusMessage && statusMessage && faceStatus !== 'ready' ? (
          <span className="max-w-[16rem] rounded-lg bg-black/70 px-3 py-1.5 text-center text-xs font-semibold leading-snug text-white backdrop-blur-sm">
            {statusMessage}
          </span>
        ) : null}
      </div>
    </div>
  );
}

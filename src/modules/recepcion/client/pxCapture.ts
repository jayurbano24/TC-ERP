/**
 * Recepción PX — tipos y mappers de captura incremental (solo cliente).
 */
export type {
  PxLotInput,
  PxBoxSnapshot,
  PxRejectedSerialScan,
  PxReceptionSnapshot,
  PxReceptionSyncStamp,
} from '@/lib/database/pxReceptionCapture.shared';

export {
  pxFingerprintFromSnapshot,
  snapshotToPxUiState,
  snapshotToGuideData,
} from '@/lib/database/pxReceptionCapture.shared';

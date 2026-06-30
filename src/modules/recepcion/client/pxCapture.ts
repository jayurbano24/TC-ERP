/**
 * Recepción PX — tipos y mappers de captura incremental (legacy bridge).
 *
 * ARCH-01 seam: re-exporta los tipos (`PxBoxSnapshot`, `PxLotInput`,
 * `PxReceptionSnapshot`) y mappers puros (`snapshotToGuideData`,
 * `snapshotToPxUiState`) desde la capa legacy para que la UI no dependa
 * directamente de `@/lib/database`.
 */
export * from '@/lib/database/pxReceptionCapture';

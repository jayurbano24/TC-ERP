/** PX captura incremental: persistencia inmediata en Supabase (siempre activo en UI). */
export function isIncrementalBoxCaptureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_INCREMENTAL_BOX_CAPTURE !== 'false';
}

/** CHG-006: captura incremental PX en servidor (staging). Default off = legacy localStorage. */
export function isIncrementalBoxCaptureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_INCREMENTAL_BOX_CAPTURE === 'true';
}

/**
 * Feature flags del cliente (Strangler Fig — Fase 2).
 * Opt-in vía NEXT_PUBLIC_* para no romper flujos legacy.
 */

function envFlags(): string[] {
  return (
    process.env.NEXT_PUBLIC_FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? []
  );
}

export function isClientFlagEnabled(code: string): boolean {
  if (process.env[`NEXT_PUBLIC_${code}`] === 'true') return true;
  return envFlags().includes(code);
}

/**
 * Transferencia Bodega→Taller siempre vía API (Phase 0).
 * El flag legacy se ignora: el fallback RPC desde navegador fue retirado.
 */
export function isWarehouseTransferApiEnabled(): boolean {
  return true;
}

/** GET /api/v1/workshop/* para conteos/cola. */
export function isWorkshopQueueApiEnabled(): boolean {
  return isClientFlagEnabled('USE_WORKSHOP_QUEUE_API');
}

/** GET /api/v1/despacho/boxes en vez de query directa. */
export function isDespachoBoxesApiEnabled(): boolean {
  return isClientFlagEnabled('USE_DESPACHO_BOXES_API');
}

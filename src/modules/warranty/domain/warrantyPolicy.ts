/** Período de garantía post-despacho para equipos Listo / Bueno. */
export const WARRANTY_PERIOD_DAYS = 90;

/** Despachos desde esta fecha deben tener prediagnóstico Listo o Bueno (clase B). Alineado a migración 268. */
export const WARRANTY_PROFILE_MANDATORY_FROM_ISO = '2026-10-16T06:00:00.000Z';

const WARRANTY_PROFILE_REQUIRED_RE =
  /WARRANTY_PROFILE_REQUIRED|perfil de garant[ií]a/i;

/** Mensaje operador cuando el RPC bloquea salida sin prediagnóstico elegible. */
export function formatWarrantyProfileRequiredError(rawMessage: string): string {
  if (!WARRANTY_PROFILE_REQUIRED_RE.test(rawMessage)) return rawMessage;
  return (
    'No se puede despachar sin perfil de garantía. Complete prediagnóstico: ' +
    'Equipo Listo (reacondicionado sin reparación) o Bueno (clase carcasa B). ' +
    'Solo equipos con perfil entran en Warranty Pack con mediciones válidas.'
  );
}

export type WarrantyDispatchProfile = 'listo' | 'bueno';

export type WarrantyDispatchSnapshot = {
  priorServiceOrderId: string;
  dispatchedAtIso: string;
  profile: WarrantyDispatchProfile;
};

export function addWarrantyDays(dispatchAt: Date, days = WARRANTY_PERIOD_DAYS): Date {
  const end = new Date(dispatchAt.getTime());
  end.setUTCDate(end.getUTCDate() + days);
  return end;
}

export function isWithinWarrantyWindow(
  dispatchAt: Date,
  ingressAt: Date,
  days = WARRANTY_PERIOD_DAYS
): boolean {
  const end = addWarrantyDays(dispatchAt, days);
  return ingressAt.getTime() >= dispatchAt.getTime() && ingressAt.getTime() <= end.getTime();
}

/** Perfil de despacho elegible: Equipo Listo (sin reparación) o carcasa Bueno (clase B). */
export function resolveWarrantyDispatchProfile(input: {
  claseCarcasa: string | null | undefined;
  hadRepairCompleted: boolean;
  hadQcOrReacondCompleted: boolean;
  dictamen?: string | null;
}): WarrantyDispatchProfile | null {
  const clase = String(input.claseCarcasa ?? '')
    .trim()
    .toUpperCase();
  if (clase === 'B') return 'bueno';
  if (!input.hadRepairCompleted && input.hadQcOrReacondCompleted) return 'listo';
  const dictamen = String(input.dictamen ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!input.hadRepairCompleted && dictamen.includes('reacond')) return 'listo';
  return null;
}

export function warrantyStatusAt(
  dispatchedAt: Date,
  now = new Date(),
  days = WARRANTY_PERIOD_DAYS
): 'en_garantia' | 'vencida' {
  const end = addWarrantyDays(dispatchedAt, days);
  return now.getTime() <= end.getTime() ? 'en_garantia' : 'vencida';
}

export function evaluateIngressWarranty(input: {
  reentryCount: number;
  ingressAt: Date;
  priorDispatch: WarrantyDispatchSnapshot | null;
  days?: number;
}): {
  isGarantia: boolean;
  warrantyEndsAt: Date | null;
  profile: WarrantyDispatchProfile | null;
} {
  const days = input.days ?? WARRANTY_PERIOD_DAYS;
  if (input.reentryCount <= 1 || !input.priorDispatch) {
    return { isGarantia: false, warrantyEndsAt: null, profile: null };
  }

  const dispatchAt = new Date(input.priorDispatch.dispatchedAtIso);
  if (Number.isNaN(dispatchAt.getTime())) {
    return { isGarantia: false, warrantyEndsAt: null, profile: input.priorDispatch.profile };
  }

  const warrantyEndsAt = addWarrantyDays(dispatchAt, days);
  const isGarantia = isWithinWarrantyWindow(dispatchAt, input.ingressAt, days);

  return {
    isGarantia,
    warrantyEndsAt,
    profile: input.priorDispatch.profile,
  };
}

export function warrantyPackCounts(
  items: Array<{ dispatchedAt: Date; profile: WarrantyDispatchProfile | null; now?: Date }>,
  now = new Date()
): {
  enGarantia: number;
  vencida: number;
  elegiblesDespachados: number;
} {
  let enGarantia = 0;
  let vencida = 0;
  let elegiblesDespachados = 0;

  for (const item of items) {
    if (!item.profile) continue;
    elegiblesDespachados += 1;
    const end = addWarrantyDays(item.dispatchedAt);
    if (now.getTime() <= end.getTime()) enGarantia += 1;
    else vencida += 1;
  }

  return { enGarantia, vencida, elegiblesDespachados };
}

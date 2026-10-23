export type PxReceptionDestination = 'CENTRAL' | 'OBSOLETE';

const POLICIES = {
  CENTRAL: {
    label: 'Vigentes',
    description: 'Enviar a Bodega Central',
    rackLocation: 'BODEGA_CENTRAL',
    seriesStatus: 'in_central_warehouse',
  },
  OBSOLETE: {
    label: 'Obsoletos',
    description: 'Enviar a Bodega de Obsoleto',
    rackLocation: 'OBSOLETO',
    seriesStatus: 'obsolete',
  },
} as const;

export function normalizePxReceptionDestination(
  value: unknown,
): PxReceptionDestination | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'CENTRAL' || normalized === 'OBSOLETE' ? normalized : null;
}

export function pxReceptionDestinationPolicy(destination: PxReceptionDestination) {
  return POLICIES[destination];
}

export function canChangePxReceptionDestination(capturedEquipment: number): boolean {
  return capturedEquipment === 0;
}

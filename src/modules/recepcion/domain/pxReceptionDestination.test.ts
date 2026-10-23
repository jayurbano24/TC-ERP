import { describe, expect, it } from 'vitest';
import {
  canChangePxReceptionDestination,
  normalizePxReceptionDestination,
  pxReceptionDestinationPolicy,
} from './pxReceptionDestination';

describe('destino de una recepción PX', () => {
  it('normaliza únicamente CENTRAL u OBSOLETE y exige una elección válida', () => {
    expect(normalizePxReceptionDestination('CENTRAL')).toBe('CENTRAL');
    expect(normalizePxReceptionDestination('obsolete')).toBe('OBSOLETE');
    expect(normalizePxReceptionDestination('')).toBeNull();
    expect(normalizePxReceptionDestination('SCRAP')).toBeNull();
  });

  it('envía vigentes a Bodega Central y obsoletos a Bodega de Obsoleto', () => {
    expect(pxReceptionDestinationPolicy('CENTRAL')).toEqual({
      label: 'Vigentes',
      description: 'Enviar a Bodega Central',
      rackLocation: 'BODEGA_CENTRAL',
      seriesStatus: 'in_central_warehouse',
    });
    expect(pxReceptionDestinationPolicy('OBSOLETE')).toEqual({
      label: 'Obsoletos',
      description: 'Enviar a Bodega de Obsoleto',
      rackLocation: 'OBSOLETO',
      seriesStatus: 'obsolete',
    });
  });

  it('bloquea cambiar la clasificación después del primer pistoleo', () => {
    expect(canChangePxReceptionDestination(0)).toBe(true);
    expect(canChangePxReceptionDestination(1)).toBe(false);
    expect(canChangePxReceptionDestination(20)).toBe(false);
  });
});

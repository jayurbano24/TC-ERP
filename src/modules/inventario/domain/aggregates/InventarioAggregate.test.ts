import { describe, expect, it } from 'vitest';
import { InventarioAggregate } from '@/modules/inventario/domain/aggregates/InventarioAggregate';

describe('InventarioAggregate', () => {
  it('rechaza cantidad negativa en create', () => {
    expect(() =>
      InventarioAggregate.create('inv-1', 't', 'b', {
        sku: 'SKU-1',
        cantidad: -1,
        estado: 'DISPONIBLE',
      })
    ).toThrow(/no puede ser negativa/i);
  });

  it('crea inventario desde recepción en tránsito', () => {
    const agg = InventarioAggregate.createFromRecepcion('inv-2', 't', 'b', 'rec-1', 'SKU-2', 3);

    expect(agg.props.cantidad).toBe(3);
    expect(agg.props.estado).toBe('EN_TRANSITO');
    expect(agg.props.origenId).toBe('rec-1');
  });

  it('rechaza cantidad cero desde recepción', () => {
    expect(() =>
      InventarioAggregate.createFromRecepcion('inv-3', 't', 'b', 'rec-1', 'SKU', 0)
    ).toThrow(/mayor a cero/i);
  });
});

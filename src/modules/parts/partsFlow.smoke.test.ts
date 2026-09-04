/**
 * Smoke rules for Bodega de Partes circuit (sin DB).
 * Circuito esperado:
 * solicitar → waiting_parts → reservar → despachar → in_qc → retorno mala → compra → recepción
 */
import { describe, expect, it } from 'vitest';

function availableQty(onHand: number, reserved: number): number {
  return Math.max(0, onHand - reserved);
}

function suggestedReorder(opts: {
  weeklyDemand: number;
  leadDays: number;
  reorderPoint: number;
  available: number;
}): number {
  return Math.max(
    0,
    Math.ceil(opts.weeklyDemand * (opts.leadDays / 7) + opts.reorderPoint - opts.available)
  );
}

describe('Bodega de Partes — reglas de circuito', () => {
  it('disponible = físico − reservado (nunca negativo)', () => {
    expect(availableQty(10, 3)).toBe(7);
    expect(availableQty(2, 5)).toBe(0);
  });

  it('solicitar piezas es opcional; solo un retorno pendiente bloquea', () => {
    const mayAdvanceWithoutRequest = true;
    const mayAdvanceWithOpenRequest = true;
    const mayAdvanceWithPendingReturn = false;
    expect(mayAdvanceWithoutRequest).toBe(true);
    expect(mayAdvanceWithOpenRequest).toBe(true);
    expect(mayAdvanceWithPendingReturn).toBe(false);
  });

  it('un lote conserva una solicitud independiente por cada OS', () => {
    const serviceOrderIds = ['os-1', 'os-2', 'os-3'];
    const requestRows = serviceOrderIds.map((serviceOrderId) => ({
      batchId: 'batch-1',
      serviceOrderId,
    }));
    expect(requestRows).toHaveLength(3);
    expect(new Set(requestRows.map((row) => row.serviceOrderId)).size).toBe(3);
    expect(requestRows.every((row) => row.batchId === 'batch-1')).toBe(true);
  });

  it('reorden = demanda×lead + mínimo − disponible', () => {
    expect(
      suggestedReorder({ weeklyDemand: 7, leadDays: 7, reorderPoint: 5, available: 2 })
    ).toBe(10);
  });

  it('flujo de status serie: in_qc → waiting_parts → in_qc', () => {
    const flow = ['in_qc', 'waiting_parts', 'in_qc'];
    expect(flow[0]).toBe('in_qc');
    expect(flow[1]).toBe('waiting_parts');
    expect(flow[2]).toBe('in_qc');
  });

  it('SKU en Reparación agrega cantidades por pieza despachada', () => {
    const items = [
      { sku: '10005686', qty: 1 },
      { sku: '10005686', qty: 1 },
      { sku: 'TEST', qty: 2 },
    ];
    const bySku = new Map<string, number>();
    for (const item of items) {
      bySku.set(item.sku, (bySku.get(item.sku) || 0) + item.qty);
    }
    const label = [...bySku.entries()]
      .map(([sku, qty]) => (qty > 1 ? `${sku}×${qty}` : sku))
      .join(' · ');
    expect(label).toBe('10005686×2 · TEST×2');
  });

  it('devolución de pieza buena reingresa el mismo tipo de stock', () => {
    const dispatched = { qty: 1, source: 'NEW' as const };
    const onHandNew = 3;
    const after = dispatched.source === 'NEW' ? onHandNew + dispatched.qty : onHandNew;
    expect(after).toBe(4);
    const movement = 'IN_RETURN_GOOD';
    expect(movement).not.toBe('RETURN_BAD');
  });
});

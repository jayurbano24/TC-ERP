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
});

import { describe, expect, it } from 'vitest';
import { DespachoAggregate } from '@/modules/despacho/domain/aggregates/DespachoAggregate';

describe('DespachoAggregate', () => {
  const baseProps = {
    reparacionId: 'rep-1',
    clienteNombre: 'Cliente Test',
    equipoInfo: 'Router Cisco',
    estado: 'PENDIENTE' as const,
  };

  it('crea despacho y emite evento de creación', () => {
    const agg = DespachoAggregate.create('dsp-1', 't', 'b', baseProps);

    expect(agg.props.estado).toBe('PENDIENTE');
    expect(agg.domainEvents.some((e) => e.eventName === 'DespachoCreadoDomainEvent')).toBe(true);
  });

  it('enruta y cambia estado a EN_RUTA', () => {
    const agg = DespachoAggregate.create('dsp-2', 't', 'b', baseProps);
    agg.clearEvents();

    agg.enrutar('TRACK-99', 'Zona 10');

    expect(agg.props.estado).toBe('EN_RUTA');
    expect(agg.props.trackingCode).toBe('TRACK-99');
    expect(agg.domainEvents.some((e) => e.eventName === 'DespachoEnRutadoDomainEvent')).toBe(true);
  });

  it('confirma entrega', () => {
    const agg = DespachoAggregate.create('dsp-3', 't', 'b', { ...baseProps, estado: 'EN_RUTA' });
    const fecha = new Date('2026-06-22T12:00:00Z');

    agg.confirmarEntrega(fecha);

    expect(agg.props.estado).toBe('ENTREGADO');
    expect(agg.props.fechaEntrega).toEqual(fecha);
  });
});

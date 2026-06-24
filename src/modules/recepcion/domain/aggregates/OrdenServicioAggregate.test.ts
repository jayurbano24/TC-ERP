import { describe, expect, it } from 'vitest';
import { OrdenServicioAggregate } from '@/modules/recepcion/domain/aggregates/OrdenServicioAggregate';

describe('OrdenServicioAggregate', () => {
  const baseEquipo = {
    id: 'eq-1',
    numeroSerie: 'SN-001',
    marca: 'Cisco',
    modelo: 'DPC3941',
  };

  it('crea recepción CAC y emite RecepcionCreatedEvent', () => {
    const agg = OrdenServicioAggregate.create('os-1', 'tenant-1', 'branch-1', 'CAC', {
      equipo: baseEquipo,
      estadoRecepcion: 'PENDIENTE',
    });

    expect(agg.id).toBe('os-1');
    expect(agg.domainEvents).toHaveLength(1);
    expect(agg.domainEvents[0].eventName).toBe('RecepcionCreatedEvent');
  });

  it('exige guía y transporte para PX', () => {
    expect(() =>
      OrdenServicioAggregate.create('os-px', 't', 'b', 'PX', {
        equipo: baseEquipo,
        estadoRecepcion: 'PENDIENTE',
      })
    ).toThrow(/guía y el transporte/i);
  });

  it('crea PX cuando guía y transporte están presentes', () => {
    const agg = OrdenServicioAggregate.create('os-px', 't', 'b', 'PX', {
      equipo: baseEquipo,
      estadoRecepcion: 'PENDIENTE',
      guiaPx: 'GUIA-123',
      transporte: 'Cargo Express',
    });

    expect(agg.props.tipoRecepcion).toBe('PX');
    expect(agg.domainEvents).toHaveLength(1);
  });
});

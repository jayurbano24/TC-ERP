import { describe, expect, it } from 'vitest';
import { DiagnosticoAggregate } from '@/modules/produccion/domain/aggregates/DiagnosticoAggregate';

describe('DiagnosticoAggregate', () => {
  const baseProps = {
    ordenLogisticaId: 'ol-1',
    estado: 'PENDIENTE' as const,
  };

  it('crea diagnóstico en estado PENDIENTE y emite evento de creación', () => {
    const agg = DiagnosticoAggregate.create('diag-1', 't', 'b', baseProps);

    expect(agg.props.estado).toBe('PENDIENTE');
    const created = agg.domainEvents.find((e) => e.eventName === 'DiagnosticoCreadoDomainEvent');
    expect(created).toBeDefined();
    expect(created.aggregateId).toBe('diag-1');
    expect(created.payload.ordenLogisticaId).toBe('ol-1');
  });

  it('inicia diagnóstico: asigna técnico, pasa a EN_PROCESO y emite evento', () => {
    const agg = DiagnosticoAggregate.create('diag-2', 't', 'b', baseProps);
    agg.clearEvents();

    agg.iniciarDiagnostico('tec-9');

    expect(agg.props.tecnicoId).toBe('tec-9');
    expect(agg.props.estado).toBe('EN_PROCESO');
    const iniciado = agg.domainEvents.find((e) => e.eventName === 'DiagnosticoIniciadoDomainEvent');
    expect(iniciado).toBeDefined();
    expect(iniciado.payload.tecnicoId).toBe('tec-9');
  });

  it('completa diagnóstico: pasa a COMPLETADO con observaciones y emite evento', () => {
    const agg = DiagnosticoAggregate.create('diag-3', 't', 'b', baseProps);
    agg.clearEvents();

    agg.completarDiagnostico('Falla en fuente de poder');

    expect(agg.props.estado).toBe('COMPLETADO');
    expect(agg.props.observaciones).toBe('Falla en fuente de poder');
    const completado = agg.domainEvents.find((e) => e.eventName === 'DiagnosticoCompletadoDomainEvent');
    expect(completado).toBeDefined();
    expect(completado.payload.observaciones).toBe('Falla en fuente de poder');
  });

  it('mantiene la secuencia de eventos a lo largo del ciclo de vida', () => {
    const agg = DiagnosticoAggregate.create('diag-4', 't', 'b', baseProps);
    agg.iniciarDiagnostico('tec-1');
    agg.completarDiagnostico('OK');

    const names = agg.domainEvents.map((e) => e.eventName);
    expect(names).toEqual([
      'DiagnosticoCreadoDomainEvent',
      'DiagnosticoIniciadoDomainEvent',
      'DiagnosticoCompletadoDomainEvent',
    ]);
  });
});

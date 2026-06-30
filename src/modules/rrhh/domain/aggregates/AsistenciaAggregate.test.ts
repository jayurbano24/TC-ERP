import { describe, expect, it } from 'vitest';
import { AsistenciaAggregate } from '@/modules/rrhh/domain/aggregates/AsistenciaAggregate';

describe('AsistenciaAggregate', () => {
  const fecha = new Date('2026-06-29T00:00:00Z');

  it('crea una asistencia presencial con entrada', () => {
    const entrada = new Date('2026-06-29T13:00:00Z');
    const agg = AsistenciaAggregate.create('asi-1', 't', 'b', {
      empleadoId: 'emp-1',
      fecha,
      entrada,
      tipo: 'PRESENCIAL',
    });

    expect(agg.props.empleadoId).toBe('emp-1');
    expect(agg.props.entrada).toEqual(entrada);
    expect(agg.props.salida).toBeUndefined();
  });

  it('marca la salida cuando hay entrada registrada', () => {
    const entrada = new Date('2026-06-29T13:00:00Z');
    const salida = new Date('2026-06-29T22:00:00Z');
    const agg = AsistenciaAggregate.create('asi-2', 't', 'b', {
      empleadoId: 'emp-2',
      fecha,
      entrada,
      tipo: 'PRESENCIAL',
    });

    agg.marcarSalida(salida);

    expect(agg.props.salida).toEqual(salida);
  });

  it('lanza error al marcar salida sin entrada previa', () => {
    const agg = AsistenciaAggregate.create('asi-3', 't', 'b', {
      empleadoId: 'emp-3',
      fecha,
      tipo: 'FALTA',
    });

    expect(() => agg.marcarSalida(new Date('2026-06-29T22:00:00Z'))).toThrow(
      'No se puede marcar salida sin haber marcado entrada.'
    );
  });
});

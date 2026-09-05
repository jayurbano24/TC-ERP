import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  boxSeriesStatusLabel,
  classifyExternalBoxOutcome,
  describeBoxLocation,
  describeBoxTraceDetail,
} from './boxLocationTrace';

const traceReader = readFileSync(
  join(process.cwd(), 'src', 'modules', 'inventario', 'server', 'findExternalBoxTrace.ts'),
  'utf8',
);

describe('trazabilidad de cajas fuera de Bodega', () => {
  it('trata ELIMINADO con equipos en otra área como traslado, no como baja', () => {
    expect(
      classifyExternalBoxOutcome({
        rack: 'ELIMINADO',
        movementType: 'TRASLADO',
        dominantUnitStatus: 'in_workshop',
        destinationLabel: 'Taller',
      }),
    ).toEqual({
      outcome: 'TRANSFERRED',
      outcomeLabel: 'Trasladada a Taller',
    });
  });

  it('reserva la baja para eliminaciones autorizadas por gerencia', () => {
    expect(
      classifyExternalBoxOutcome({ rack: 'ELIMINADO', hasApprovedDeletion: true }),
    ).toEqual({
      outcome: 'ADMIN_DELETED',
      outcomeLabel: 'Baja autorizada por gerencia',
    });
    expect(classifyExternalBoxOutcome({ rack: 'ELIMINADO' }).outcome).toBe(
      'OUTSIDE_WAREHOUSE',
    );
  });

  it('nunca muestra ELIMINADO como ubicación física', () => {
    expect(describeBoxLocation('ELIMINADO')).toBe('Fuera de Bodega Central');
    expect(describeBoxLocation('ELIMINADO', 'TRANSFERRED', 'Taller')).toBe(
      'Fuera de Bodega por traslado · Taller',
    );
    expect(describeBoxLocation(null)).toBe('Fuera de Bodega Central');
    expect(describeBoxLocation('B-01-03')).toBe('B-01-03');
  });

  it('explica el traslado sin hablar de eliminación', () => {
    const detail = describeBoxTraceDetail({
      outcome: 'TRANSFERRED',
      currentUnits: 19,
      dominantLabel: 'Taller',
      dominantCount: 19,
    });
    expect(detail).toContain('salió de Bodega Central');
    expect(detail).toContain('sus 19 equipos');
    expect(detail).toContain('trasladados a Taller');
    expect(detail).not.toMatch(/elimin/i);
  });

  it('no atribuye todos los equipos al área mayoritaria cuando quedaron repartidos', () => {
    const detail = describeBoxTraceDetail({
      outcome: 'TRANSFERRED',
      currentUnits: 12,
      dominantLabel: 'Control de Calidad',
      dominantCount: 5,
    });
    expect(detail).toContain('5 de sus 12 equipos');
    expect(detail).toContain('El resto está en otras ubicaciones');
    expect(detail).not.toMatch(/porque sus 12 equipos/);
  });

  it('prioriza una salida registrada sobre el rack histórico', () => {
    expect(
      classifyExternalBoxOutcome({
        rack: 'ELIMINADO',
        movementType: 'SALIDA',
        dispatchReference: 'TC-INV-120',
      }),
    ).toEqual({
      outcome: 'DISPATCHED',
      outcomeLabel: 'Salida o despacho registrado',
    });
  });

  it('clasifica Outbound, Scrap y traslados', () => {
    expect(classifyExternalBoxOutcome({ rack: 'OUTBOUND' }).outcome).toBe('OUTBOUND');
    expect(
      classifyExternalBoxOutcome({
        rack: 'ELIMINADO',
        dominantUnitStatus: 'in_dispatch_warehouse',
      }).outcome,
    ).toBe('OUTBOUND');
    expect(classifyExternalBoxOutcome({ rack: 'SCRAP' }).outcome).toBe('SCRAP');
    expect(classifyExternalBoxOutcome({ rack: 'TALLER-QC' }).outcome).toBe('TRANSFERRED');
  });

  it('presenta etiquetas operativas legibles', () => {
    expect(boxSeriesStatusLabel('in_workshop')).toBe('Taller');
    expect(boxSeriesStatusLabel('in_qc')).toBe('Control de Calidad');
    expect(boxSeriesStatusLabel('dispatched')).toBe('Despachada');
  });

  it('resuelve la caja real de cada equipo, no solo su estado', () => {
    expect(traceReader).toContain('current_box_id');
    expect(traceReader).toContain('Outbound ');
  });

  it('ordena despachos por la columna real dispatched_at', () => {
    expect(traceReader).toContain(".order('dispatched_at', { ascending: false })");
    expect(traceReader).not.toMatch(
      /\.from\('dispatches'\)[\s\S]*?\.order\('created_at'/,
    );
  });
});

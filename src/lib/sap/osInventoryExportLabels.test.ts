import { describe, expect, it } from 'vitest';
import {
  OS_INVENTORY_EXPORT_STATUS,
  resolveOsInventoryExportStatus,
  resolveSeriesInventoryExportStatus,
} from './osInventoryExportLabels';

describe('resolveOsInventoryExportStatus', () => {
  const baseCtx = {
    pendienteIngreso: false,
    osHasDispatch: false,
    auditedCentralSeriesIds: new Set<string>(),
    boxById: new Map(),
    osHasScrapBox: false,
  };

  it('una OS con diag + rep → Reparación (etapa más avanzada)', () => {
    const r = resolveOsInventoryExportStatus(
      [
        { current_status: 'in_workshop', current_box_id: null },
        { current_status: 'in_qc', current_box_id: null },
      ],
      baseCtx,
    );
    expect(r).toBe(OS_INVENTORY_EXPORT_STATUS.REPARACION);
  });

  it('sin series', () => {
    expect(resolveOsInventoryExportStatus([], baseCtx)).toBe(
      OS_INVENTORY_EXPORT_STATUS.SIN_SERIES,
    );
  });
});

describe('resolveSeriesInventoryExportStatus', () => {
  const baseCtx = {
    pendienteIngreso: false,
    osHasDispatch: false,
    auditedCentralSeriesIds: new Set<string>(),
    boxById: new Map(),
    osHasScrapBox: false,
  };

  it('pendiente ingreso OS → Pendiente Bodega', () => {
    const r = resolveSeriesInventoryExportStatus(
      { current_status: 'in_workshop', current_box_id: null },
      { ...baseCtx, pendienteIngreso: true },
    );
    expect(r).toBe(OS_INVENTORY_EXPORT_STATUS.PENDIENTE_BODEGA);
  });

  it('in_workshop → Diagnóstico', () => {
    const r = resolveSeriesInventoryExportStatus(
      { current_status: 'in_workshop', current_box_id: null },
      baseCtx,
    );
    expect(r).toBe(OS_INVENTORY_EXPORT_STATUS.DIAGNOSTICO);
  });

  it('in_qc → Reparación', () => {
    const r = resolveSeriesInventoryExportStatus(
      { current_status: 'in_qc', current_box_id: null },
      baseCtx,
    );
    expect(r).toBe(OS_INVENTORY_EXPORT_STATUS.REPARACION);
  });

  it('in_validation → Control de Calidad', () => {
    const r = resolveSeriesInventoryExportStatus(
      { current_status: 'in_validation', current_box_id: null },
      baseCtx,
    );
    expect(r).toBe(OS_INVENTORY_EXPORT_STATUS.CONTROL_CALIDAD);
  });

  it('in_control_warehouse → L3', () => {
    const r = resolveSeriesInventoryExportStatus(
      { current_status: 'in_control_warehouse', current_box_id: null },
      baseCtx,
    );
    expect(r).toBe(OS_INVENTORY_EXPORT_STATUS.L3);
  });

  it('equipo listo (auditoría)', () => {
    const r = resolveSeriesInventoryExportStatus(
      {
        id: 's1',
        current_status: 'in_central_warehouse',
        current_box_id: 'box-1',
      },
      {
        ...baseCtx,
        auditedCentralSeriesIds: new Set(['s1']),
      },
    );
    expect(r).toBe(OS_INVENTORY_EXPORT_STATUS.EQUIPO_LISTO);
  });

  it('in_dispatch → Bodega Despacho', () => {
    const r = resolveSeriesInventoryExportStatus(
      { current_status: 'in_dispatch_warehouse', current_box_id: 'b1' },
      baseCtx,
    );
    expect(r).toBe(OS_INVENTORY_EXPORT_STATUS.BODEGA_DESPACHO);
  });
});

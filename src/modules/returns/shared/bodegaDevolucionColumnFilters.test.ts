import { describe, expect, it } from 'vitest';
import {
  createEmptyBodegaDevolucionExcelFilters,
  matchesBodegaDevolucionExcelFilters,
} from './bodegaDevolucionColumnFilters';
import type { BoxReturnRow } from '@/modules/returns/client/returnData';

const baseRow: BoxReturnRow = {
  id: '1',
  sn: 'CAJA-001',
  cliente: 'Cliente',
  motivo: 'Garantía',
  fecha: '2026-01-01',
  timestamp: 1,
  estatus: 'Pendiente',
  dbId: 'db1',
  receptionId: 'rec1',
  isBoxReturn: true,
  os: 'OS-1',
  processDate: '01/01/2026',
  processUser: 'JUAN',
  transferNotes: 'Nota A',
  agencyRaw: 'AG1',
};

describe('bodegaDevolucionColumnFilters', () => {
  it('sin filtros incluye todas las filas', () => {
    const filters = createEmptyBodegaDevolucionExcelFilters();
    expect(matchesBodegaDevolucionExcelFilters(baseRow, filters, [])).toBe(true);
  });

  it('filtra por valor de guía', () => {
    const filters = createEmptyBodegaDevolucionExcelFilters();
    filters.guia = new Set(['CAJA-001']);
    expect(matchesBodegaDevolucionExcelFilters(baseRow, filters, [])).toBe(true);
    filters.guia = new Set(['OTRA']);
    expect(matchesBodegaDevolucionExcelFilters(baseRow, filters, [])).toBe(false);
  });
});

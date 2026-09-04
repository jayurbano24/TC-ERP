import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { nextFreePxBoxCode } from '@/lib/database/pxReceptionCapture.shared';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260904043500_px_rescan_deleted_serial.sql'),
  'utf8',
);

describe('re-escaneo de serie eliminada en la misma guía', () => {
  it('recicla la fila anulada antes de que el UNIQUE la rechace', () => {
    expect(migration).toContain('BEFORE INSERT ON public.px_reception_equipment');
    expect(migration).toContain("IF v_existing.capture_status = 'deleted' THEN");
    expect(migration).toContain('DELETE FROM public.px_reception_equipment WHERE id = v_existing.id;');
  });

  it('mantiene bloqueada la serie que sigue activa o ya promovida', () => {
    expect(migration).toContain("IF v_existing.capture_status = 'promoted' THEN");
    expect(migration).toContain('DUPLICATE_IN_RECEPTION: La serie % ya está en la caja %');
  });

  it('no toca la fila cuando la serie es nueva en la guía', () => {
    expect(migration).toContain('IF NOT FOUND THEN\n    RETURN NEW;\n  END IF;');
  });
});

describe('nextFreePxBoxCode', () => {
  it('respeta el código propuesto cuando está libre', () => {
    expect(nextFreePxBoxCode(['CAJA-1'], 'CAJA-2')).toBe('CAJA-2');
  });

  it('salta el correlativo de una caja eliminada que conserva su código', () => {
    expect(nextFreePxBoxCode(['CAJA-1', 'CAJA-2'], 'CAJA-2')).toBe('CAJA-3');
  });

  it('salta huecos consecutivos ya ocupados', () => {
    expect(nextFreePxBoxCode(['CAJA-1', 'CAJA-2', 'CAJA-3', 'CAJA-4'], 'CAJA-2')).toBe('CAJA-5');
  });

  it('ignora mayúsculas y códigos de otra familia', () => {
    expect(nextFreePxBoxCode(['caja-2', 'BOX-90'], 'CAJA-2')).toBe('CAJA-3');
  });

  it('no reutiliza un código sin sufijo numérico', () => {
    expect(nextFreePxBoxCode(['EXTRA'], 'EXTRA')).toBe('EXTRA-1');
  });
});

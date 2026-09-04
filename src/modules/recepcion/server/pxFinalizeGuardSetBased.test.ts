import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260904190000_px_finalize_guard_set_based.sql',
  ),
  'utf8',
);
const captureTs = readFileSync(
  join(process.cwd(), 'src', 'lib', 'database', 'pxReceptionCapture.ts'),
  'utf8',
);
const hookTs = readFileSync(
  join(process.cwd(), 'src', 'app', '(erp)', 'recepcion', 'hooks', 'useReceptionPXIncremental.ts'),
  'utf8',
);

describe('PX finalize guard set-based', () => {
  it('no revalida serie a serie con advisory lock en el trigger', () => {
    expect(migration).not.toContain('pg_advisory_xact_lock');
    expect(migration).not.toContain('public.validate_serial_for_px');
    expect(migration).toContain('WITH rec_serials AS');
  });

  it('sigue bloqueando cajas con cero aceptadas', () => {
    expect(migration).toContain('ZERO_ACCEPTED_BOX');
  });

  it('solo rechequea OS abierta al entrar a FINALIZANDO', () => {
    expect(migration).toContain("upper(coalesce(NEW.status, '')) = 'FINALIZANDO'");
  });
});

describe('PX finalize UX after timeout', () => {
  it('pide reintentar sin exigir cerrar cajas de nuevo', () => {
    expect(captureTs).toContain('Pulse Finalizar de nuevo');
    expect(captureTs).not.toContain('Cierre todas las cajas e intente de nuevo');
  });

  it('orquesta prep y promote desde el cliente', () => {
    expect(hookTs).toContain('finalizePxReceptionStepwise');
    expect(hookTs).not.toContain('finalizePxReceptionApi({');
  });
});

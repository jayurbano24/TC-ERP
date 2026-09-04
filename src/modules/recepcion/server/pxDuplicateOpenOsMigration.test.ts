import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260904040632_px_duplicate_open_os_guard.sql',
  ),
  'utf8',
);
const counterMigration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260904041747_px_received_units_transactional_sync.sql',
  ),
  'utf8',
);
const legacyReceptionWriter = readFileSync(
  join(process.cwd(), 'src', 'lib', 'database', 'receptions.ts'),
  'utf8',
);

describe('PX duplicate open OS database contract', () => {
  it('serializa solicitudes concurrentes y protege S1-S4', () => {
    expect(migration).toContain('pg_advisory_xact_lock(hashtextextended(v_sn, 0))');
    expect(migration).toContain('uniq_service_order_serial_cycles_open_serial');
    expect(migration).toContain('BEFORE INSERT OR UPDATE OF serial_number');
  });

  it('audita el rechazo antes de devolver DUPLICATE_OPEN_OS', () => {
    const auditInsert = migration.indexOf(
      'INSERT INTO public.px_rejected_serial_scans',
    );
    const rejectionReturn = migration.indexOf(
      "'error_code', 'DUPLICATE_OPEN_OS'",
      auditInsert,
    );
    const equipmentInsert = migration.indexOf(
      'INSERT INTO public.px_reception_equipment',
    );

    expect(auditInsert).toBeGreaterThan(-1);
    expect(rejectionReturn).toBeGreaterThan(auditInsert);
    expect(equipmentInsert).toBeGreaterThan(rejectionReturn);
  });

  it('bloquea caja y recepción con cero aceptadas', () => {
    expect(migration).toContain('BOX_EMPTY_DUPLICATE_OPEN_OS');
    expect(migration).toContain('ZERO_ACCEPTED_BOX');
    expect(migration).toContain("e.capture_status IN ('active', 'promoted')");
  });

  it('elimina el bypass de escritura directa autenticada', () => {
    expect(migration).toMatch(
      /REVOKE INSERT, UPDATE, DELETE[\s\S]*px_reception_equipment,[\s\S]*px_reception_serial_lines[\s\S]*FROM anon, authenticated;/,
    );
  });

  it('sincroniza received_units dentro de la transacción y excluye rechazos', () => {
    expect(counterMigration).toContain('AFTER INSERT OR DELETE OR UPDATE OF capture_status');
    expect(counterMigration).toContain("e.capture_status IN ('active', 'promoted')");
    expect(counterMigration).not.toContain('px_rejected_serial_scans');
  });

  it('mantiene deshabilitado el escritor PX legado no transaccional', () => {
    expect(legacyReceptionWriter).toContain(
      'const directLegacyPxWritesDisabled: boolean = true',
    );
    expect(legacyReceptionWriter).toContain(
      'Flujo PX legado deshabilitado',
    );
  });
});

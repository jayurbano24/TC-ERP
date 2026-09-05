import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260904232533_box_deletion_manager_authorization.sql',
  ),
  'utf8',
);

const warehouseUi = readFileSync(
  join(
    process.cwd(),
    'src',
    'app',
    '(erp)',
    'bodega',
    'gestion',
    'BodegaGestionV2.tsx',
  ),
  'utf8',
);

const dispatchUi = readFileSync(
  join(process.cwd(), 'src', 'app', '(erp)', 'despacho', 'page.tsx'),
  'utf8',
);

const authorizationsUi = readFileSync(
  join(process.cwd(), 'src', 'app', '(erp)', 'autorizaciones', 'page.tsx'),
  'utf8',
);

describe('autorización gerencial para eliminar cajas', () => {
  it('restringe la decisión al gerente configurado, no a cualquier admin', () => {
    expect(migration).toContain('gurbano@techcommwireless.com');
    expect(migration).toContain('app_is_box_deletion_manager');
    expect(migration).not.toContain('IF NOT public.app_is_admin()');
  });

  it('bloquea en base de datos cualquier baja gobernada sin solicitud aprobada', () => {
    expect(migration).toContain('boxes_require_deletion_approval');
    expect(migration).toContain('BOX_DELETION_REQUIRES_MANAGER_APPROVAL');
    expect(migration).toContain('app.box_deletion_approved_request_id');
    expect(migration).toContain("r.status = 'approved'");
    expect(migration).toContain('r.box_id = OLD.id');
  });

  it('audita solicitud, aprobación y rechazo con identidad', () => {
    expect(migration).toContain('ELIMINACION_CAJA_SOLICITADA');
    expect(migration).toContain('ELIMINACION_CAJA_AUTORIZADA');
    expect(migration).toContain('ELIMINACION_CAJA_RECHAZADA');
    expect(migration).toContain('requested_by');
    expect(migration).toContain('reviewed_by');
  });

  it('al vaciar una caja de bodega abre solicitud en vez de eliminar directamente', () => {
    expect(warehouseUi).toContain('setDeleteAuthTarget({');
    expect(warehouseUi).toContain(
      'Para eliminarla debe enviar una solicitud a gurbano@techcommwireless.com.',
    );
  });

  it('Despacho solicita aprobación y Autorizaciones sólo habilita al correo gerente', () => {
    expect(dispatchUi).toContain('requestBoxDeletion({');
    expect(dispatchUi).not.toContain(
      ".from('boxes').update({ rack_location: 'ELIMINADO' }).eq('id', disp.dbId)",
    );
    expect(authorizationsUi).toContain(
      "email?.trim().toLowerCase() === 'gurbano@techcommwireless.com'",
    );
  });
});

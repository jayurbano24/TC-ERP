import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260908152000_os_despachado_status_ssot.sql'),
  'utf8',
);

describe('Despachadas SSOT (status OS + series)', () => {
  it('detecta DESPACHADO/CERRADO además de series dispatched', () => {
    expect(migration).toContain('is_service_order_dispatched');
    expect(migration).toContain("IN ('DESPACHADO', 'CERRADO')");
    expect(migration).toContain("current_status::text = 'dispatched'");
  });

  it('alinea SAP KPIs e inventario OS', () => {
    expect(migration).toContain('count_sap_integration_kpis');
    expect(migration).toContain('count_os_inventory_modules');
    expect(migration).toContain('despachado_os AS');
  });
});

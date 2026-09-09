import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260908150000_sap_dashboard_kpis_en_planta.sql'),
  'utf8',
);

describe('SAP dashboard KPIs en planta', () => {
  it('cuenta estados SAP excluyendo despachadas', () => {
    expect(migration).toContain('count_sap_integration_kpis');
    expect(migration).toContain("current_status::text = 'dispatched'");
    expect(migration).toContain("'enPlanta'");
    expect(migration).toContain("'validados'");
    expect(migration).toMatch(
      /FROM en_planta WHERE sap_integration_status = 'Validado SAP'/,
    );
  });

  it('expone histórico aparte para referencia', () => {
    expect(migration).toContain("'historicoValidados'");
  });

  it('listado por estado usa la misma base en planta', () => {
    expect(migration).toContain('fetch_os_sap_status_en_planta');
    expect(migration).toContain('NOT EXISTS');
  });
});

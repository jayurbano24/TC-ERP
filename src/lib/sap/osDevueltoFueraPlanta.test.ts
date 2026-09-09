import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260908156000_os_devuelto_fuera_planta.sql'),
  'utf8',
);
const cuadreMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260908157000_os_inventory_historico_cuadre.sql'),
  'utf8',
);

describe('OS devueltas fuera de planta', () => {
  it('expone helpers devuelto y fuera_planta', () => {
    expect(migration).toContain('is_service_order_devuelto');
    expect(migration).toContain('is_service_order_fuera_planta');
    expect(migration).toContain("'DEVUELTO'");
    expect(migration).toContain("'DEVUELTO_A_AGENCIA'");
    expect(migration).toContain("'DEVUELTO_BLOQUE'");
  });

  it('alinea inventario, SAP KPIs y ledger en planta', () => {
    expect(migration).toContain("'devuelto', (SELECT n FROM devuelto_os)");
    expect(migration).toContain("'devueltas', (SELECT count(*)::bigint FROM devuelto_os)");
    expect(migration).toContain('fuera_planta_os');
    expect(migration).toContain("'activas_ledger', greatest((SELECT n FROM total_os) - (SELECT n FROM fuera_planta_os), 0)");
  });

  it('cuadre histórico: despachadas y devueltas excluyentes, tiles sin fuera_planta', () => {
    expect(cuadreMigration).toContain('NOT public.is_service_order_fuera_planta(s.service_order_id)');
    expect(cuadreMigration).toMatch(
      /despachado_os AS \([\s\S]*NOT IN \([\s\S]*'DEVUELTO'/,
    );
    expect(cuadreMigration).toContain("'fuera_planta', (SELECT n FROM fuera_planta_os)");
  });

  it('158000 reemplaza per-row function por CTE fuera_planta_ids', () => {
    const perfMigration = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260908158000_os_inventory_fuera_planta_perf.sql'),
      'utf8',
    );
    expect(perfMigration).toContain('fuera_planta_ids AS');
    expect(perfMigration).not.toContain('is_service_order_fuera_planta(s.service_order_id)');
    expect(perfMigration).toContain('NOT EXISTS (SELECT 1 FROM fuera_planta_ids fp');
  });
});

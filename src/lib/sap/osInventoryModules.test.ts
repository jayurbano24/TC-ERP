import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOsRealityTableRows, type OsInventoryModules } from './osInventoryModules';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260905020000_os_modules_bodega_despacho.sql',
  ),
  'utf8',
);
const panel = readFileSync(
  join(
    process.cwd(),
    'src',
    'app',
    '(erp)',
    'integracion-sap',
    '_components',
    'OsCapacityInstalledPanel.tsx',
  ),
  'utf8',
);

function mods(overrides: Partial<OsInventoryModules> = {}): OsInventoryModules {
  return {
    total: 0,
    con_serie: 0,
    sin_series: 0,
    bodega_con_caja: 0,
    bodega_despacho: 0,
    bodega_sin_caja: 0,
    pistoleo_en_curso: 0,
    backoffice: 0,
    series_recepcionado_bo: 0,
    historial_backoffice: 0,
    equipo_listo: 0,
    despachado: 0,
    taller_diagnostico: 0,
    taller_reparacion: 0,
    taller_reacondicionado: 0,
    taller_qc: 0,
    taller_l3: 0,
    taller_scraps_piso: 0,
    taller_piso_total: 0,
    bodega_scraps: 0,
    scrap_ledger: 0,
    qc: 0,
    taller: 0,
    scrap: 0,
    control: 0,
    otro: 0,
    activas_ledger: 0,
    activas: 0,
    ...overrides,
  };
}

describe('Inventario OS · módulo Bodega Despacho', () => {
  it('cuenta las OS en caja Outbound como módulo propio', () => {
    expect(migration).toContain("'in_dispatch_warehouse'");
    expect(migration).toContain("'bodega_despacho', (SELECT bodega_despacho FROM mods)");
  });

  it('no permite que una OS sume a la vez en Bodega Central y en Despacho', () => {
    expect(migration).toMatch(
      /AS bodega_con_caja[\s\S]*/,
    );
    const bodegaFilter = migration.slice(
      migration.indexOf('WITH agg AS'),
      migration.indexOf('AS bodega_con_caja'),
    );
    expect(bodegaFilter).toMatch(
      /NOT EXISTS \([\s\S]*FROM public\.series sd[\s\S]*'in_dispatch_warehouse'/,
    );
  });

  it('mantiene las OS de Despacho dentro del total en planta', () => {
    expect(migration).toMatch(/AS activas[\s\S]*/);
    const activasBlock = migration.slice(
      migration.indexOf('(SELECT n FROM cac_bo) AS backoffice'),
      migration.indexOf(')::bigint AS activas'),
    );
    expect(activasBlock).toContain('a.bodega_despacho');
  });

  it('expone la fila 05c en el detalle de realidad OS', () => {
    const rows = buildOsRealityTableRows(mods({ bodega_despacho: 867 }));
    const row = rows.find((r) => r.key === 'bodega_despacho');
    expect(row?.os).toBe(867);
    expect(row?.modulo).toContain('Bodega Despacho');
  });

  it('muestra la tarjeta Outbound en el panel de capacidad instalada', () => {
    expect(panel).toContain("label: 'Bodega Despacho'");
    expect(panel).toContain("sub: 'En caja Outbound'");
    expect(panel).toContain('bodegaDespacho');
  });
});

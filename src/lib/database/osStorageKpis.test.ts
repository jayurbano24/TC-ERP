import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260905013507_os_storage_kpis.sql'),
  'utf8',
);
const kpi = readFileSync(join(process.cwd(), 'src', 'lib', 'database', 'kpi.ts'), 'utf8');
const dashboard = readFileSync(
  join(process.cwd(), 'src', 'app', '(erp)', 'dashboard', 'page.tsx'),
  'utf8',
);

describe('Almacenamientos cuenta OS, no series', () => {
  it('agrega por service_order_id y marca despacho a nivel OS', () => {
    expect(migration).toContain('GROUP BY s.service_order_id');
    expect(migration).toContain("bool_or(s.current_status::text = 'dispatched')");
    expect(migration).toContain("(SELECT count(*)::bigint FROM public.service_orders)");
  });

  it('deja de contar filas crudas de series en el cliente', () => {
    const fn = kpi.slice(kpi.indexOf('export async function getStorageData'));
    expect(fn).toContain("rpc('count_os_storage_kpis')");
    expect(fn).not.toMatch(/from\('series'\)[\s\S]*head: true/);
  });

  it('aclara en UI que la unidad es OS', () => {
    expect(dashboard).toContain('Histórico total de OS');
    expect(dashboard).toContain('OS con salida registrada');
  });
});

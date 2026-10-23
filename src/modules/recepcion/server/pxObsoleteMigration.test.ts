import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');

function migrationSql(): string {
  if (!existsSync(migrationsDir)) return '';
  const file = readdirSync(migrationsDir).find((name) => name.includes('px_reception_destination'));
  return file ? readFileSync(join(migrationsDir, file), 'utf8') : '';
}

describe('migración de destino PX', () => {
  const sql = migrationSql();

  it('persiste únicamente CENTRAL u OBSOLETE', () => {
    expect(sql).toContain('inventory_destination');
    expect(sql).toMatch(/CHECK[\s\S]*CENTRAL[\s\S]*OBSOLETE/i);
  });

  it('impide unir el mismo SAP con una clasificación diferente', () => {
    expect(sql).toContain('DESTINATION_MISMATCH');
  });

  it('bloquea editar la clasificación después del primer pistoleo', () => {
    expect(sql).toContain('DESTINATION_LOCKED');
    expect(sql).toContain('px_reception_equipment');
  });

  it('finaliza según el destino de toda la recepción', () => {
    expect(sql).toContain("'BODEGA_CENTRAL'");
    expect(sql).toContain("'OBSOLETO'");
    expect(sql).toContain("'in_central_warehouse'");
    expect(sql).toContain("'obsolete'");
  });
});

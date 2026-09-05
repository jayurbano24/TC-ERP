import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { boxSeriesStatusLabel } from '../domain/boxLocationTrace';
import { resolveWarehouseStatusLabel } from '@/lib/database/warehouse';

const migrationDir = join(process.cwd(), 'supabase', 'migrations');
const enumMigration = readFileSync(
  join(migrationDir, '20260905004105_add_dispatch_warehouse_series_status.sql'),
  'utf8',
);
const enforcementMigration = readFileSync(
  join(migrationDir, '20260905004109_enforce_dispatch_warehouse_location.sql'),
  'utf8',
);
const dispatchPage = readFileSync(
  join(process.cwd(), 'src', 'app', '(erp)', 'despacho', 'page.tsx'),
  'utf8',
);

describe('separación Bodega Central y Bodega Despacho', () => {
  it('define un estado físico independiente para Outbound', () => {
    expect(enumMigration).toContain("ADD VALUE IF NOT EXISTS 'in_dispatch_warehouse'");
    expect(boxSeriesStatusLabel('in_dispatch_warehouse')).toBe('Bodega Despacho');
    expect(resolveWarehouseStatusLabel('in_dispatch_warehouse')).toBe('BODEGA DESPACHO');
  });

  it('impide el bypass al asignar una serie directamente a una caja Outbound', () => {
    expect(enforcementMigration).toContain('series_sync_status_from_box_location');
    expect(enforcementMigration).toMatch(
      /BEFORE INSERT OR UPDATE OF current_box_id, current_status[\s\S]*ON public\.series/,
    );
    expect(enforcementMigration).toContain(
      "NEW.current_status := 'in_dispatch_warehouse'::public.series_status",
    );
  });

  it('sincroniza series si cambia el rack de una caja completa', () => {
    expect(enforcementMigration).toContain('box_sync_series_status_from_rack');
    expect(enforcementMigration).toMatch(
      /AFTER INSERT OR UPDATE OF rack_location[\s\S]*ON public\.boxes/,
    );
  });

  it('repara datos existentes sin incorporar Despacho al inventario Central', () => {
    expect(enforcementMigration).toMatch(
      /UPDATE public\.series s[\s\S]*FROM public\.boxes b[\s\S]*OUTBOUND/,
    );
    expect(enforcementMigration).not.toMatch(
      /WAREHOUSE_INVENTORY_STATUSES[\s\S]*in_dispatch_warehouse/,
    );
  });

  it('permite reencajar equipo suelto de Despacho sin robarlo de otro Outbound', () => {
    expect(dispatchPage).toContain("sData.current_status === 'in_dispatch_warehouse'");
    expect(dispatchPage).toContain('El equipo ya pertenece a otra caja de Bodega Despacho.');
    expect(dispatchPage).toContain('Una serie hermana del equipo pertenece a otro Outbound.');
  });
});

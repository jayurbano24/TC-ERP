import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260905010828_exclude_dispatched_from_sap_validation.sql',
  ),
  'utf8',
);
const unmatchedExport = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'sap', 'unmatched', 'route.ts'),
  'utf8',
);
const sapPage = readFileSync(
  join(process.cwd(), 'src', 'app', '(erp)', 'integracion-sap', 'page.tsx'),
  'utf8',
);

describe('SAP excluye OS despachadas de la revalidación', () => {
  it('protege en base de datos los estados SAP de OS y series despachadas', () => {
    expect(migration).toContain('protect_dispatched_os_sap_status');
    expect(migration).toContain('protect_dispatched_series_sap_status');
    expect(migration).toMatch(
      /BEFORE UPDATE OF sap_integration_status[\s\S]*ON public\.service_orders/,
    );
    expect(migration).toMatch(/BEFORE UPDATE OF sap_status[\s\S]*ON public\.series/);
  });

  it('excluye despachadas del cierre chunked y del camino compacto', () => {
    const exclusions = migration.match(
      /sd\.current_status::text = 'dispatched'/g,
    );
    expect(exclusions?.length ?? 0).toBeGreaterThanOrEqual(8);
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.sap_sync_matches_finalize');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.sap_sync_matches_tx');
  });

  it('repara falsos negativos históricos como validación conservada', () => {
    expect(migration).toMatch(
      /UPDATE public\.service_orders so[\s\S]*SET sap_integration_status = 'Validado SAP'/,
    );
    expect(migration).toMatch(
      /UPDATE public\.series s[\s\S]*SET sap_status = 'Validado'/,
    );
  });

  it('también excluye despachadas de la exportación', () => {
    expect(unmatchedExport).toContain("s.current_status === 'dispatched'");
    expect(unmatchedExport).toContain('activeUnmatchedOsIds');
    expect(unmatchedExport).toContain('equipos: activeUnmatchedOsIds.length');
  });

  it('entrega Excel (.xlsx) y no CSV', () => {
    expect(unmatchedExport).toContain("searchParams.get('format') || 'xlsx'");
    expect(unmatchedExport).toContain("bookType: 'xlsx'");
    expect(unmatchedExport).toContain("filename=\"sap-sin-coincidencia-${stamp}.xlsx\"");
    expect(unmatchedExport).not.toContain('text/csv');
    expect(sapPage).toContain('/api/sap/unmatched?format=xlsx');
    expect(sapPage).toContain('Exportar Excel');
  });

  it('explica que la tarjeta representa solo OS activas', () => {
    expect(sapPage).toContain('OS activas en TC con serie');
    expect(sapPage).toContain('% de OS activas');
  });
});

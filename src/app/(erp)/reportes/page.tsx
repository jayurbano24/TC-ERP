"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import { ModulePage } from '@/components/module-page';
import { Download, FileSpreadsheet, Filter, Loader2 } from 'lucide-react';
import {
  downloadReportApi,
  fetchReportCatalogApi,
  isCentralReportingEnabledClient,
} from '@/modules/reporting/client/reportingApi';

type ReportDef = {
  code: string;
  name: string;
  category: string;
  description: string | null;
  columns: string[];
  requiresDateRange: boolean;
};

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function ReportesPage() {
  const enabled = isCentralReportingEnabledClient();
  const [reports, setReports] = useState<ReportDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [format, setFormat] = useState<'XLSX' | 'CSV'>('XLSX');
  const [exporting, setExporting] = useState(false);
  const [{ from, to }, setDateRange] = useState(defaultDateRange);
  const [batchNumber, setBatchNumber] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState('');
  const [country, setCountry] = useState('GT');
  const [technology, setTechnology] = useState('');

  const isOpsMonthly = selectedCode === 'OPERACIONES_MENSUAL_TECNOLOGIA';

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    fetchReportCatalogApi()
      .then((list) => {
        setReports(list);
        if (list.length > 0) setSelectedCode(list[0].code);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar reportes'))
      .finally(() => setLoading(false));
  }, [enabled]);

  const selected = useMemo(
    () => reports.find((r) => r.code === selectedCode) ?? null,
    [reports, selectedCode]
  );

  const categories = useMemo(() => {
    const map = new Map<string, ReportDef[]>();
    for (const r of reports) {
      const list = map.get(r.category) || [];
      list.push(r);
      map.set(r.category, list);
    }
    return [...map.entries()];
  }, [reports]);

  const handleExport = async () => {
    if (!selected) return;
    setExporting(true);
    setError(null);
    try {
      await downloadReportApi(
        selected.code,
        {
          from: selected.requiresDateRange && !isOpsMonthly ? from : undefined,
          to: selected.requiresDateRange && !isOpsMonthly ? to : undefined,
          batchNumber: selected.code === 'DESPACHO_POR_LOTE_SALIDA' ? batchNumber || undefined : undefined,
          year: isOpsMonthly ? year || undefined : undefined,
          month: isOpsMonthly ? month || undefined : undefined,
          country: isOpsMonthly ? country || undefined : undefined,
          technology: isOpsMonthly ? technology || undefined : undefined,
        },
        format
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  if (!enabled) {
    return (
      <ModulePage title="Portal de Reportes" subtitle="Centralización de exportaciones TC-ERP" category="Gestión">
        <Card className="p-8 text-center">
          <p className="text-[var(--muted)]">
            Activa <code className="text-sm bg-[var(--surface-hover)] px-2 py-1 rounded">USE_CENTRAL_REPORTING</code> en
            FEATURE_FLAGS para usar el portal centralizado.
          </p>
        </Card>
      </ModulePage>
    );
  }

  return (
    <ModulePage
      title="Portal de Reportes"
      subtitle="Catálogo unificado de exportaciones operativas — Excel y CSV con auditoría."
      category="Gestión"
      actions={
        <Badge variant="blue" className="uppercase tracking-widest text-[10px] font-black">
          Fase 2B · Reporting
        </Badge>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 overflow-hidden border border-[var(--border)] p-0 shadow-lg">
          <div className="border-b border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="text-sm font-black tracking-widest text-[var(--heading)] uppercase">Catálogo</h3>
          </div>
          <div className="max-h-[520px] overflow-y-auto p-3 space-y-4">
            {loading && (
              <div className="flex items-center gap-2 text-[var(--muted)] text-sm p-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
              </div>
            )}
            {!loading &&
              categories.map(([category, items]) => (
                <div key={category}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-2 px-1">
                    {category}
                  </p>
                  <div className="space-y-1">
                    {items.map((r) => (
                      <button
                        key={r.code}
                        type="button"
                        onClick={() => setSelectedCode(r.code)}
                        className={`w-full text-left p-3 rounded-xl text-sm font-bold transition-all ${
                          selectedCode === r.code
                            ? 'bg-[var(--surface-hover)] text-[var(--heading)] border-2 border-[var(--accent)] shadow-sm'
                            : 'bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-hover)] border-2 border-transparent'
                        }`}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </Card>

        <Card className="lg:col-span-2 p-6 border-none shadow-lg space-y-6">
          {!selected ? (
            <p className="text-[var(--muted)]">Selecciona un reporte del catálogo.</p>
          ) : (
            <>
              <div>
                <h2 className="text-xl font-black text-[var(--heading)]">{selected.name}</h2>
                <p className="text-sm text-[var(--muted)] mt-1">{selected.description}</p>
                <p className="text-[10px] font-mono text-[var(--muted)] mt-2">{selected.code}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selected.requiresDateRange && !isOpsMonthly && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] flex items-center gap-1">
                        <Filter className="w-3 h-3" /> Desde
                      </label>
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setDateRange((d) => ({ ...d, from: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] text-sm font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">Hasta</label>
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => setDateRange((d) => ({ ...d, to: e.target.value }))}
                        className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] text-sm font-bold"
                      />
                    </div>
                  </>
                )}

                {isOpsMonthly && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] flex items-center gap-1">
                        <Filter className="w-3 h-3" /> Año
                      </label>
                      <input
                        type="number"
                        min={2000}
                        max={2100}
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] text-sm font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">País</label>
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value.toUpperCase())}
                        placeholder="GT"
                        maxLength={8}
                        className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] text-sm font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                        Mes (opcional)
                      </label>
                      <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] text-sm font-bold"
                      >
                        <option value="">Todos</option>
                        {['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'].map(
                          (m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                        Tecnología (opcional)
                      </label>
                      <input
                        type="text"
                        value={technology}
                        onChange={(e) => setTechnology(e.target.value)}
                        placeholder="Ej: EMTA, GPON, ADSL"
                        className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] text-sm font-bold"
                      />
                    </div>
                  </>
                )}

                {selected.code === 'DESPACHO_POR_LOTE_SALIDA' && (
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                      Nº Lote (opcional)
                    </label>
                    <input
                      type="text"
                      value={batchNumber}
                      onChange={(e) => setBatchNumber(e.target.value)}
                      placeholder="Ej: LS-2026-00002"
                      className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] text-sm font-bold"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">Formato</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as 'XLSX' | 'CSV')}
                    className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] text-sm font-bold"
                  >
                    <option value="XLSX">Excel (.xlsx)</option>
                    <option value="CSV">CSV</option>
                  </select>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-2">Columnas</p>
                <div className="flex flex-wrap gap-2">
                  {selected.columns.map((col) => (
                    <span
                      key={col}
                      className="text-[10px] font-bold bg-[var(--surface-hover)] text-[var(--muted)] px-2 py-1 rounded-lg"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/15 p-3 text-sm font-bold text-[var(--danger)]">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-2">
                <Button
                  variant="primary"
                  className="!bg-[var(--accent)] !text-[var(--accent-foreground)] hover:!opacity-90"
                  leftIcon={
                    exporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : format === 'XLSX' ? (
                      <FileSpreadsheet className="h-4 w-4" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )
                  }
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting ? 'Generando…' : 'Descargar reporte'}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </ModulePage>
  );
}

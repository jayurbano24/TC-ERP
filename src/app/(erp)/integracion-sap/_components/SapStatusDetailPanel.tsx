'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, Loader2 } from 'lucide-react';
import { Badge, Button, Card, TablePagination } from '@/components/ui';
import { erpSoftStat } from '@/lib/design/tokens';
import { apiFetch } from '@/lib/http/apiFetch';
import { SAP_DASHBOARD_STATES } from '@/lib/sap/sapDashboardStates';
import type { SapValidationState } from '@/modules/sap-integration/domain/sap-validation-status';

const PAGE_SIZE = 25;

type SeriesDetail = {
  serial_number: string;
  material: string | null;
  valuation: string | null;
  sap_status: string | null;
  current_status: string | null;
  box_code: string | null;
  ubicacion?: string;
};

type OsStatusRow = {
  id: string;
  os_label: string | null;
  main_serial: string | null;
  os_status: string | null;
  last_sap_sync: string | null;
  materials: string[];
  material_count: number;
  ubicacion: string;
  series_count: number;
  series: SeriesDetail[];
};

type Props = {
  status: SapValidationState;
  onConsultSerial: (serial: string) => void;
};

async function fetchOsByStatus(status: SapValidationState, page: number) {
  const res = await apiFetch(
    `/api/sap/os-by-status?status=${encodeURIComponent(status)}&page=${page}&pageSize=${PAGE_SIZE}`,
  );
  const body = (await res.json()) as {
    success: boolean;
    error?: string;
    total?: number;
    count?: number;
    data?: OsStatusRow[];
  };
  if (!res.ok || !body.success) {
    throw new Error(body.error || `Error HTTP ${res.status}`);
  }
  return body;
}

export function SapStatusDetailPanel({ status, onConsultSerial }: Props) {
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const config = SAP_DASHBOARD_STATES.find((s) => s.status === status);

  const query = useQuery({
    queryKey: ['sap-os-by-status', status, page],
    queryFn: () => fetchOsByStatus(status, page),
    staleTime: 30_000,
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startItem = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(safePage * PAGE_SIZE, total);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await apiFetch(
        `/api/sap/os-by-status?status=${encodeURIComponent(status)}&format=xlsx`,
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `Error HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sap-${status.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const expanded = status === 'Pendiente Revisión' || status === 'Sin Coincidencia';

  return (
    <Card className="p-6 border border-[var(--border)] shadow-sm rounded-3xl bg-[var(--surface)]">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xl font-black text-[var(--heading)] uppercase tracking-tight">
            Detalle · {config?.title ?? status}
          </h3>
          <p className="text-[11px] font-bold text-[var(--muted)] mt-1 max-w-2xl leading-relaxed">
            {config?.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-[var(--surface-hover)] text-[var(--heading)] border border-[var(--border)] uppercase text-[10px] font-black tracking-widest">
            {total.toLocaleString()} OS
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exporting || total === 0}
            leftIcon={
              exporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )
            }
            onClick={() => void handleExport()}
            className="text-[10px] font-black uppercase tracking-widest"
          >
            Exportar Excel
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      ) : query.isError ? (
        <div className={`${erpSoftStat.danger} p-4 rounded-xl flex items-start gap-3`}>
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-sm font-bold mb-2">
              {query.error instanceof Error ? query.error.message : 'No se pudo cargar el detalle'}
            </p>
            <Button type="button" variant="outline" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm font-bold text-[var(--muted)] py-10 text-center">
          No hay equipos en estado {status} en esta página.
        </p>
      ) : expanded ? (
        <div className="space-y-4">
          {rows.map((eq) => (
            <div
              key={eq.id}
              className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--surface-hover)]/40"
            >
              <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]">
                <span className="font-black text-[var(--heading)] font-mono text-sm">{eq.os_label || '—'}</span>
                <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest">
                  Main {eq.main_serial || '—'}
                </span>
                <span className="text-[10px] font-bold text-[var(--muted)]">{eq.ubicacion}</span>
                {eq.materials.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 ml-auto">
                    {eq.materials.map((m) => (
                      <Badge
                        key={m}
                        className="bg-[var(--warning)]/15 text-[var(--warning)] border-none font-mono text-[10px] font-black"
                      >
                        Mat {m}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)] border-b border-[var(--border)]">
                      <th className="px-4 py-2">Serie</th>
                      <th className="px-4 py-2">Material</th>
                      <th className="px-4 py-2">Valoración</th>
                      <th className="px-4 py-2">SAP status</th>
                      <th className="px-4 py-2">Ubicación</th>
                      <th className="px-4 py-2">Caja</th>
                      <th className="px-4 py-2">Estado TC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eq.series.map((s) => (
                      <tr key={s.serial_number} className="border-b border-[var(--border)]/60 last:border-0">
                        <td className="px-4 py-2 font-mono font-bold text-[var(--heading)]">{s.serial_number}</td>
                        <td className="px-4 py-2 font-mono font-black text-[var(--warning)]">{s.material || '—'}</td>
                        <td className="px-4 py-2 font-mono">{s.valuation || '—'}</td>
                        <td className="px-4 py-2">{s.sap_status || '—'}</td>
                        <td className="px-4 py-2">{s.ubicacion || '—'}</td>
                        <td className="px-4 py-2 font-mono">{s.box_code || '—'}</td>
                        <td className="px-4 py-2">{s.current_status || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-[var(--border)] flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-[10px] font-black uppercase tracking-widest"
                  onClick={() => onConsultSerial(eq.main_serial || eq.series[0]?.serial_number || '')}
                >
                  Consultar serie principal
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)] bg-[var(--surface-hover)] border-b border-[var(--border)]">
                <th className="px-4 py-3">OS</th>
                <th className="px-4 py-3">Serie principal</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Series</th>
                <th className="px-4 py-3">Último sync SAP</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((eq) => (
                <tr key={eq.id} className="border-b border-[var(--border)]/60 last:border-0">
                  <td className="px-4 py-3 font-mono font-black text-[var(--heading)]">{eq.os_label || '—'}</td>
                  <td className="px-4 py-3 font-mono">{eq.main_serial || '—'}</td>
                  <td className="px-4 py-3">{eq.ubicacion}</td>
                  <td className="px-4 py-3">{eq.series_count}</td>
                  <td className="px-4 py-3">
                    {eq.last_sap_sync ? new Date(eq.last_sap_sync).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[10px] font-black uppercase tracking-widest"
                      onClick={() => onConsultSerial(eq.main_serial || eq.series[0]?.serial_number || '')}
                    >
                      Consultar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-4">
          <TablePagination
            totalCount={total}
            page={safePage}
            totalPages={totalPages}
            startItem={startItem}
            endItem={endItem}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="equipos"
          />
        </div>
      )}
    </Card>
  );
}

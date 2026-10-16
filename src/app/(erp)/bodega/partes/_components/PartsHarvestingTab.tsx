'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, DataTable, notify, type DataTableColumn } from '@/components/ui';
import { erpFieldClass, erpLabelClass, erpTableHeader, erpTableHeaderText } from '@/lib/design/tokens';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Package, Plus, Recycle, Search, Trash2 } from 'lucide-react';
import {
  createPartHarvestApi,
  fetchHarvestDonors,
  fetchHarvestHistory,
  fetchHarvestUsage,
  fetchPartsCatalog,
  type HarvestDonorApi,
} from '@/lib/api/parts';

type DraftLine = {
  key: string;
  catalogId: string;
  qty: number;
  notes: string;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={erpLabelClass}>{label}</span>
      {children}
    </label>
  );
}

export function PartsHarvestingTab() {
  const qc = useQueryClient();
  const [donorSearch, setDonorSearch] = useState('');
  const debouncedDonor = useDebouncedValue(donorSearch, 350);
  const [selectedDonor, setSelectedDonor] = useState<HarvestDonorApi | null>(null);
  const [sessionNotes, setSessionNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [draftCatalogId, setDraftCatalogId] = useState('');
  const [draftQty, setDraftQty] = useState('1');
  const [draftLineNotes, setDraftLineNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [traceSessionId, setTraceSessionId] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['parts', 'catalog', 'harvest'],
    queryFn: () => fetchPartsCatalog({ activeOnly: true }),
  });

  const donorsQuery = useQuery({
    queryKey: ['parts', 'harvest', 'donors', debouncedDonor],
    queryFn: () => fetchHarvestDonors(debouncedDonor),
    enabled: debouncedDonor.trim().length >= 2,
  });

  const historyQuery = useQuery({
    queryKey: ['parts', 'harvest', 'history'],
    queryFn: () => fetchHarvestHistory(),
  });

  const usageQuery = useQuery({
    queryKey: ['parts', 'harvest', 'usage', traceSessionId],
    queryFn: () => fetchHarvestUsage(traceSessionId!),
    enabled: Boolean(traceSessionId),
  });

  const catalog = catalogQuery.data ?? [];

  const addLine = () => {
    if (!draftCatalogId) {
      notify.warning('Seleccione una pieza del catálogo');
      return;
    }
    const qty = Number(draftQty);
    if (!(qty > 0)) {
      notify.warning('Cantidad debe ser mayor a 0');
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: `${draftCatalogId}-${Date.now()}`,
        catalogId: draftCatalogId,
        qty,
        notes: draftLineNotes.trim(),
      },
    ]);
    setDraftQty('1');
    setDraftLineNotes('');
  };

  const submitHarvest = async () => {
    if (!selectedDonor) {
      notify.error('Seleccione un equipo Scrap/Irreparable');
      return;
    }
    if (lines.length === 0) {
      notify.error('Agregue al menos una pieza recuperada');
      return;
    }
    setBusy(true);
    try {
      await createPartHarvestApi({
        seriesId: selectedDonor.series_id,
        sessionNotes: sessionNotes.trim() || null,
        lines: lines.map((l) => ({
          catalogId: l.catalogId,
          qty: l.qty,
          notes: l.notes || null,
        })),
      });
      notify.success('Piezas cargadas a stock recuperado', {
        description: 'Quedó registrada la trazabilidad desde el equipo donante.',
      });
      setLines([]);
      setSessionNotes('');
      setSelectedDonor(null);
      setDonorSearch('');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['parts', 'harvest', 'history'] }),
        qc.invalidateQueries({ queryKey: ['parts', 'inventory'] }),
        qc.invalidateQueries({ queryKey: ['parts', 'movements'] }),
      ]);
    } catch (e) {
      notify.error('No se pudo registrar harvesting', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const historyCols: DataTableColumn<any>[] = useMemo(
    () => [
      {
        id: 'when',
        header: 'Fecha',
        width: '120px',
        cell: (r) =>
          r.created_at
            ? new Date(r.created_at).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })
            : '—',
      },
      {
        id: 'os',
        header: 'OS donante',
        width: '110px',
        cell: (r) => <span className="font-mono font-bold">{r.os_label || '—'}</span>,
      },
      {
        id: 'sn',
        header: 'Serie',
        width: '120px',
        cell: (r) => <span className="font-mono text-[10px]">{r.serial_number || '—'}</span>,
      },
      {
        id: 'status',
        header: 'Estatus',
        width: '100px',
        cell: (r) => (
          <Badge variant="yellow" className="text-[8px]">
            {r.donor_status}
          </Badge>
        ),
      },
      {
        id: 'lines',
        header: 'Piezas',
        width: 'minmax(200px,1fr)',
        cell: (r) => (
          <span className="text-[10px] font-semibold">
            {(r.lines || [])
              .map(
                (l: { catalog?: { sku?: string }; qty?: number }) =>
                  `${l.catalog?.sku ?? '?'}×${l.qty ?? 0}`
              )
              .join(' · ') || '—'}
          </span>
        ),
      },
      {
        id: 'trace',
        header: 'Uso posterior',
        width: '110px',
        align: 'center',
        cell: (r) => (
          <Button
            variant="outline"
            className="!h-7 !px-2 !text-[9px]"
            onClick={() => setTraceSessionId(String(r.id))}
          >
            Ver trazas
          </Button>
        ),
      },
    ],
    []
  );

  const usageCols: DataTableColumn<any>[] = useMemo(
    () => [
      {
        id: 'when',
        header: 'Fecha',
        width: '120px',
        cell: (r) =>
          r.created_at
            ? new Date(r.created_at).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })
            : '—',
      },
      {
        id: 'type',
        header: 'Movimiento',
        width: '90px',
        cell: (r) => r.movement_type,
      },
      {
        id: 'sku',
        header: 'SKU',
        width: '100px',
        cell: (r) => r.catalog?.sku ?? '—',
      },
      {
        id: 'qty',
        header: 'Cant.',
        width: '60px',
        align: 'right',
        cell: (r) => r.qty,
      },
      {
        id: 'os_use',
        header: 'OS uso',
        width: '110px',
        cell: (r) => r.service_orders?.os_label ?? r.service_order_id?.slice(0, 8) ?? '—',
      },
      {
        id: 'notes',
        header: 'Notas',
        width: 'minmax(160px,1fr)',
        cell: (r) => <span className="text-[10px] text-[var(--muted)]">{r.notes || '—'}</span>,
      },
    ],
    []
  );

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-4 border-l-4 border-l-violet-500">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-violet-50">
            <Recycle className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">Harvesting</h3>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-3xl">
              Recupere piezas de equipos <strong>Scrap / Irreparables</strong> hacia{' '}
              <strong>stock recuperado</strong> (bodega de partes usadas). Cada ingreso queda ligado a la OS y
              serie donante; consulte movimientos posteriores (despacho/reserva) del mismo SKU.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Field label="Buscar equipo donante (OS o serie, mín. 2 caracteres)">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  className={`${erpFieldClass} pl-10`}
                  value={donorSearch}
                  onChange={(e) => {
                    setDonorSearch(e.target.value);
                    setSelectedDonor(null);
                  }}
                  placeholder="TC-… o número de serie"
                />
              </div>
            </Field>
            {donorsQuery.isFetching && (
              <p className="text-[10px] font-bold text-slate-400 uppercase">Buscando…</p>
            )}
            <div className="max-h-40 overflow-auto space-y-1 border border-[var(--border)] rounded-xl p-2 bg-[var(--surface-hover)]">
              {(donorsQuery.data ?? []).map((d) => (
                <button
                  key={d.series_id}
                  type="button"
                  onClick={() => setSelectedDonor(d)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    selectedDonor?.series_id === d.series_id
                      ? 'bg-violet-100 border border-violet-300 font-bold'
                      : 'hover:bg-white border border-transparent'
                  }`}
                >
                  <span className="font-mono">{d.os_label || d.service_order_id.slice(0, 8)}</span>
                  {' · '}
                  <span className="font-mono">{d.serial_number}</span>
                  {' · '}
                  {d.model_name || '—'} · {d.current_status}
                  {d.rack_location ? ` · ${d.rack_location}` : ''}
                </button>
              ))}
              {debouncedDonor.trim().length >= 2 &&
                !donorsQuery.isFetching &&
                (donorsQuery.data ?? []).length === 0 && (
                  <p className="text-xs text-[var(--muted)] px-2 py-3">Sin equipos elegibles en esta búsqueda.</p>
                )}
            </div>
            {selectedDonor && (
              <p className="text-[10px] font-bold text-violet-700 bg-violet-50 rounded-lg px-3 py-2">
                Donante: {selectedDonor.os_label} · SN {selectedDonor.serial_number}
              </p>
            )}
            <Field label="Notas de sesión (opcional)">
              <input
                className={erpFieldClass}
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="Condición del chasis, observaciones…"
              />
            </Field>
          </div>

          <div className="space-y-3 border border-[var(--border)] rounded-xl p-3 bg-[var(--surface)]">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
              Piezas a ingresar (recuperado)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Field label="Pieza (SKU)">
                <select
                  className={erpFieldClass}
                  value={draftCatalogId}
                  onChange={(e) => setDraftCatalogId(e.target.value)}
                >
                  <option value="">— Catálogo —</option>
                  {catalog.map((c: { id: string; sku: string; name: string }) => (
                    <option key={c.id} value={c.id}>
                      {c.sku} · {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cantidad">
                <input
                  className={erpFieldClass}
                  type="number"
                  min={1}
                  value={draftQty}
                  onChange={(e) => setDraftQty(e.target.value)}
                />
              </Field>
              <Field label="Nota línea">
                <input
                  className={erpFieldClass}
                  value={draftLineNotes}
                  onChange={(e) => setDraftLineNotes(e.target.value)}
                  placeholder="Ej. tapa, fuente…"
                />
              </Field>
            </div>
            <Button variant="outline" className="h-9 gap-1.5 text-[10px] font-black uppercase" onClick={addLine}>
              <Plus className="w-3.5 h-3.5" /> Agregar línea
            </Button>
            <ul className="space-y-1 max-h-36 overflow-auto">
              {lines.map((l) => {
                const cat = catalog.find((c: { id: string }) => c.id === l.catalogId) as
                  | { sku?: string; name?: string }
                  | undefined;
                return (
                  <li
                    key={l.key}
                    className="flex items-center justify-between gap-2 text-xs border-b border-[var(--border)] py-1.5"
                  >
                    <span>
                      <span className="font-mono font-bold">{cat?.sku}</span> × {l.qty}
                      {l.notes ? ` · ${l.notes}` : ''}
                    </span>
                    <button
                      type="button"
                      className="text-rose-500 p-1"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
              {lines.length === 0 && (
                <li className="text-xs text-[var(--muted)] py-2">Sin líneas — agregue piezas extraídas.</li>
              )}
            </ul>
            <Button
              className="w-full h-10 gap-2 font-black uppercase text-[10px]"
              disabled={busy || !selectedDonor || lines.length === 0}
              onClick={() => void submitHarvest()}
            >
              <Package className="w-4 h-4" />
              Registrar harvesting → stock recuperado
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className={`${erpTableHeader} px-2.5 py-1.5`}>
          <span className={erpTableHeaderText}>Historial de harvesting</span>
        </div>
        <DataTable
          columns={historyCols}
          data={(historyQuery.data ?? []) as any[]}
          getRowId={(r) => r.id}
          compact
          rowHeight={36}
          minWidth={720}
          emptyMessage={historyQuery.isLoading ? 'Cargando…' : 'Aún no hay sesiones de harvesting.'}
        />
      </Card>

      {traceSessionId && (
        <Card className="overflow-hidden p-0 border-violet-200">
          <div className={`${erpTableHeader} px-2.5 py-1.5 flex justify-between items-center`}>
            <span className={erpTableHeaderText}>Movimientos posteriores (mismo SKU, tras harvesting)</span>
            <Button variant="outline" className="!h-7 !text-[9px]" onClick={() => setTraceSessionId(null)}>
              Cerrar
            </Button>
          </div>
          <DataTable
            columns={usageCols}
            data={(usageQuery.data ?? []) as any[]}
            getRowId={(r) => r.id}
            compact
            rowHeight={32}
            minWidth={640}
            emptyMessage={
              usageQuery.isLoading
                ? 'Cargando…'
                : 'Sin despachos/reservas registrados aún para estos SKU después del harvesting.'
            }
          />
        </Card>
      )}
    </div>
  );
}

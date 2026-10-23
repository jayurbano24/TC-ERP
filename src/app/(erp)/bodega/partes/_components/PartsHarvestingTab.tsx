'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, notify } from '@/components/ui';
import { erpFieldClass, erpLabelClass } from '@/lib/design/tokens';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Package, Plus, Recycle, Search, Trash2 } from 'lucide-react';
import {
  createPartHarvestApi,
  fetchHarvestDonors,
  fetchHarvestDonorsBulk,
  fetchPartsCatalog,
  type HarvestDonorApi,
} from '@/lib/api/parts';
import { parseHarvestBulkSerials } from '@/modules/parts/domain/harvestBulkSerials';
import {
  ALL_HARVEST_DONORS,
  assignHarvestLinesToDonors,
} from '@/modules/parts/domain/harvestLineAssignment';
import { filterHarvestCatalogByDonors } from '@/modules/parts/domain/harvestCatalogFilter';
import { validateHarvestCaseInput } from '@/modules/parts/domain/harvestCase';

type DraftLine = {
  key: string;
  donorSeriesId: string;
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
  const [bulkSerials, setBulkSerials] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const debouncedDonor = useDebouncedValue(donorSearch, 350);
  const [selectedDonors, setSelectedDonors] = useState<HarvestDonorApi[]>([]);
  const [activeDonorId, setActiveDonorId] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [draftCatalogId, setDraftCatalogId] = useState('');
  const [draftLineNotes, setDraftLineNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const catalogQuery = useQuery({
    queryKey: ['parts', 'catalog', 'harvest'],
    queryFn: () => fetchPartsCatalog({ activeOnly: true }),
  });

  const donorsQuery = useQuery({
    queryKey: ['parts', 'harvest', 'donors', debouncedDonor],
    queryFn: () => fetchHarvestDonors(debouncedDonor),
    enabled: debouncedDonor.trim().length >= 2,
  });

  const catalog = catalogQuery.data ?? [];
  const activeDonors = activeDonorId === ALL_HARVEST_DONORS
    ? selectedDonors
    : selectedDonors.filter((donor) => donor.series_id === activeDonorId);
  const compatibleCatalog = filterHarvestCatalogByDonors(catalog, activeDonors);
  const draftQuantity = activeDonorId === ALL_HARVEST_DONORS ? selectedDonors.length : 1;

  const changeActiveDonor = (donorId: string) => {
    setActiveDonorId(donorId);
    setDraftCatalogId('');
  };

  const addBulkDonors = async () => {
    let requested: string[];
    try {
      requested = parseHarvestBulkSerials(bulkSerials);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Lote de series invalido');
      return;
    }
    if (requested.length === 0) {
      notify.warning('Pegue o pistolee al menos una serie');
      return;
    }
    setBulkBusy(true);
    try {
      const found = await fetchHarvestDonorsBulk(requested);
      const foundSet = new Set(found.map((donor) => donor.serial_number.toUpperCase()));
      const missing = requested.filter((serial) => !foundSet.has(serial));
      setSelectedDonors((current) => {
        const ids = new Set(current.map((donor) => donor.series_id));
        return [...current, ...found.filter((donor) => !ids.has(donor.series_id))];
      });
      if (found.length > 1) changeActiveDonor(ALL_HARVEST_DONORS);
      else if (found[0]) changeActiveDonor(found[0].series_id);
      setBulkSerials(missing.join('\n'));
      if (found.length) notify.success(`${found.length} serie(s) agregada(s) para despiece`);
      if (missing.length) {
        notify.warning(`${missing.length} serie(s) no elegible(s) o no encontrada(s)`, {
          description: 'Permanecen en el campo para revisarlas.',
        });
      }
    } catch (error) {
      notify.error('No se pudo validar el lote de series', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const addLine = () => {
    if (!activeDonorId) {
      notify.warning('Seleccione la serie donante de esta pieza');
      return;
    }
    if (!draftCatalogId) {
      notify.warning('Seleccione una pieza del catálogo');
      return;
    }
    if (!compatibleCatalog.some((item: { id: string }) => item.id === draftCatalogId)) {
      notify.error('La pieza seleccionada no es compatible con la marca y modelo del equipo');
      setDraftCatalogId('');
      return;
    }
    const qty = draftQuantity;
    if (qty < 1 || qty > selectedDonors.length) {
      notify.warning(`La cantidad no puede superar las ${selectedDonors.length} series seleccionadas`);
      return;
    }
    const candidate = {
      key: `${draftCatalogId}-${Date.now()}`,
      donorSeriesId: activeDonorId,
      catalogId: draftCatalogId,
      qty,
      notes: draftLineNotes.trim(),
    };
    const prospectiveDonors = assignHarvestLinesToDonors(
      selectedDonors.map((donor) => donor.series_id),
      [...lines, candidate]
    ).filter((donor) => donor.lines.length > 0);
    const validation = validateHarvestCaseInput(prospectiveDonors);
    if (!validation.ok && validation.error === 'DUPLICATE_PART') {
      notify.warning('Esta pieza ya fue agregada para la misma serie');
      return;
    }
    setLines((prev) => [...prev, candidate]);
    setDraftLineNotes('');
  };

  const submitHarvest = async () => {
    if (selectedDonors.length === 0) {
      notify.error('Agregue al menos un equipo Scrap/Irreparable');
      return;
    }
    if (lines.length === 0) {
      notify.error('Agregue al menos una pieza recuperada');
      return;
    }
    const assignedDonors = assignHarvestLinesToDonors(
      selectedDonors.map((donor) => donor.series_id),
      lines
    );
    if (assignedDonors.some((donor) => donor.lines.length === 0)) {
      notify.error('Cada serie donante debe tener al menos una pieza asociada');
      return;
    }
    setBusy(true);
    try {
      await createPartHarvestApi({
        sessionNotes: sessionNotes.trim() || null,
        donors: assignedDonors,
      });
      notify.success('Piezas cargadas a stock recuperado', {
        description: 'Quedó registrada la trazabilidad desde el equipo donante.',
      });
      setLines([]);
      setSessionNotes('');
      setSelectedDonors([]);
      setActiveDonorId('');
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
            <Field label="Carga masiva de series donantes (max. 100)">
              <textarea
                className={`${erpFieldClass} min-h-24 resize-y py-3 font-mono`}
                value={bulkSerials}
                onChange={(event) => setBulkSerials(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void addBulkDonors();
                  }
                }}
                placeholder={'Pistolee o pegue una serie por linea\nSN0001\nSN0002\nSN0003'}
                aria-describedby="harvest-bulk-help"
              />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id="harvest-bulk-help" className="text-[10px] font-semibold text-[var(--muted)]">
                Tambien acepta series separadas por coma o espacio. Ctrl+Enter para validar.
              </p>
              <Button type="button" variant="outline" className="h-9 text-[10px] font-black uppercase" disabled={bulkBusy || !bulkSerials.trim()} onClick={() => void addBulkDonors()}>
                {bulkBusy ? 'Validando...' : 'Agregar series'}
              </Button>
            </div>
            <div className="border-t border-[var(--border)]" />
            <Field label="Buscar equipo donante (OS o serie, mín. 2 caracteres)">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  className={`${erpFieldClass} pl-10`}
                  value={donorSearch}
                  onChange={(e) => {
                    setDonorSearch(e.target.value);
                  }}
                  placeholder="TC-… o número de serie"
                />
              </div>
            </Field>
            {donorsQuery.isFetching && (
              <p className="text-[10px] font-bold text-slate-400 uppercase">Buscando…</p>
            )}
            {donorsQuery.isError && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                No se pudo consultar Taller SCRAPS. Intente nuevamente o refresque la pantalla.
              </p>
            )}
            <div className="max-h-40 overflow-auto space-y-1 border border-[var(--border)] rounded-xl p-2 bg-[var(--surface-hover)]">
              {(donorsQuery.data ?? []).map((d) => (
                <button
                  key={d.series_id}
                  type="button"
                  onClick={() => {
                    setSelectedDonors((current) => current.some((item) => item.series_id === d.series_id) ? current : [...current, d]);
                    changeActiveDonor(d.series_id);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    selectedDonors.some((item) => item.series_id === d.series_id)
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
                !donorsQuery.isError &&
                !donorsQuery.isFetching &&
                (donorsQuery.data ?? []).length === 0 && (
                  <p className="text-xs text-[var(--muted)] px-2 py-3">Sin equipos elegibles en esta búsqueda.</p>
                )}
            </div>
            <div className="space-y-1">
              {selectedDonors.map((donor) => (
                <div key={donor.series_id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-[10px] font-bold ${activeDonorId === donor.series_id ? 'bg-violet-100 text-violet-800' : 'bg-slate-50 text-slate-600'}`}>
                  <button type="button" onClick={() => changeActiveDonor(donor.series_id)} className="text-left">
                    {donor.os_label || 'Sin OS'} · SN {donor.serial_number} · {donor.model_name || 'Modelo no definido'} · {lines.filter((line) => line.donorSeriesId === donor.series_id || line.donorSeriesId === ALL_HARVEST_DONORS).length} pieza(s)
                  </button>
                  <button type="button" aria-label={`Quitar serie ${donor.serial_number}`} className="p-1 text-rose-500" onClick={() => {
                    const remaining = selectedDonors.filter((item) => item.series_id !== donor.series_id);
                    setSelectedDonors(remaining);
                    setLines((current) => current.filter((line) => line.donorSeriesId !== donor.series_id));
                    if (activeDonorId === donor.series_id) changeActiveDonor('');
                    if (activeDonorId === ALL_HARVEST_DONORS && remaining.length <= 1) {
                      changeActiveDonor(remaining[0]?.series_id || '');
                    }
                  }}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
              <Field label="Serie donante">
                <select className={erpFieldClass} value={activeDonorId} onChange={(e) => {
                  changeActiveDonor(e.target.value);
                }}>
                  <option value="">— Seleccione —</option>
                  {selectedDonors.length > 1 && <option value={ALL_HARVEST_DONORS}>TODAS LAS SERIES ({selectedDonors.length})</option>}
                  {selectedDonors.map((donor) => <option key={donor.series_id} value={donor.series_id}>{donor.serial_number}</option>)}
                </select>
              </Field>
              <Field label="Pieza (SKU)">
                <select
                  className={erpFieldClass}
                  value={draftCatalogId}
                  onChange={(e) => setDraftCatalogId(e.target.value)}
                  disabled={activeDonors.length === 0 || catalogQuery.isLoading || compatibleCatalog.length === 0}
                >
                  <option value="">{catalogQuery.isLoading ? '— Cargando catalogo —' : '— Catalogo compatible —'}</option>
                  {compatibleCatalog.map((c: { id: string; sku: string; name: string }) => (
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
                  max={Math.max(selectedDonors.length, 1)}
                  step={1}
                  value={draftQuantity}
                  readOnly
                  title="Una unidad por cada serie donante seleccionada"
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
            {activeDonors.length > 0 && compatibleCatalog.length === 0 && !catalogQuery.isLoading && (
              <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                No existe un catalogo de partes compatible con la marca y modelo seleccionados. Primero debe crear las piezas y asignarlas a ese modelo en Configuracion &gt; Piezas / SKU.
              </p>
            )}
            {activeDonorId === ALL_HARVEST_DONORS && (
              <p className="rounded-lg bg-violet-50 px-3 py-2 text-[10px] font-bold text-violet-800">
                Aplicacion masiva: la cantidad indicada se ingresara por cada una de las {selectedDonors.length} series.
              </p>
            )}
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
                      <span className="mr-2 rounded bg-violet-50 px-1.5 py-0.5 font-mono text-[9px] text-violet-700">{l.donorSeriesId === ALL_HARVEST_DONORS ? `TODAS (${selectedDonors.length})` : `SN ${selectedDonors.find((donor) => donor.series_id === l.donorSeriesId)?.serial_number || '?'}`}</span>
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
              disabled={busy || selectedDonors.length === 0 || lines.length === 0}
              onClick={() => void submitHarvest()}
            >
              <Package className="w-4 h-4" />
              Registrar harvesting → stock recuperado
            </Button>
          </div>
        </div>
      </Card>

    </div>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, notify } from '@/components/ui';
import { erpTableHeader, erpTableHeaderText, erpFieldClass, erpLabelClass, erpTab } from '@/lib/design/tokens';
import { Package, Truck, X, Loader2, Printer } from 'lucide-react';
import { fetchDespachoBoxItems, type DespachoBoxItem } from '@/lib/api/despachoBoxItems';
import { dispatchBoxFromWarehouse } from '@/lib/database/warehouse';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getAgencies, getPxProviders } from '@/lib/database/config';
import { allocateSalidaCode } from '@/lib/api/despachoReads';
import { printOutboundLabels } from './printOutboundLabel';
import { printOutboundDetalle } from './printOutboundDetalle';
import {
  buildEquipmentSerialSlots,
  coalesceMaterialLote,
} from '@/lib/sap/equipmentSerialSlots';

export type SalidaBoxSummary = {
  id: string;
  dbId: string;
  material?: string;
  valuation?: string;
  brandName?: string;
  modelName?: string;
  techName?: string;
  filled_count?: number;
  valorado_count?: number;
  novalorado_count?: number;
  unidades: number;
  series_preview?: string[];
};

type Props = {
  boxes: SalidaBoxSummary[];
  /** Si es individual, el conduce lista Series por equipo. */
  dispatchType?: 'massive' | 'individual' | 'master_box';
  onClose: () => void;
  onDone: () => void;
};

type ClientChannel = 'PX' | 'CAC';

type CatalogOption = { id: string; code?: string; name: string };

function classifyValuation(raw: unknown): 'valorado' | 'novalorado' | 'otro' {
  const s = String(raw ?? '').trim();
  if (!s) return 'otro';
  if (/novalorad|no\s*valorad/i.test(s)) return 'novalorado';
  if (/valorado/i.test(s)) return 'valorado';
  return 'otro';
}

function isBoxComplete(b: SalidaBoxSummary, itemCount?: number): boolean {
  const filled = itemCount ?? b.filled_count ?? 0;
  const cap = Number(b.unidades) || 0;
  return cap > 0 && filled >= cap;
}

/** Carga series de la caja vía Supabase (fallback si falla la API). */
async function loadBoxItemsViaSupabase(boxDbId: string): Promise<DespachoBoxItem[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data: inBox, error } = await supabase
    .from('series')
    .select(
      'id, serial_number, service_order_id, material, valuation, sap_status, created_at, updated_at'
    )
    .eq('current_box_id', boxDbId)
    .order('updated_at', { ascending: false });

  if (error || !inBox?.length) return [];

  const osIds = [...new Set(inBox.map((r) => r.service_order_id).filter(Boolean))] as string[];
  let siblings: Array<{
    id: string;
    serial_number: string | null;
    service_order_id?: string | null;
    material?: string | null;
    valuation?: string | null;
    sap_status?: string | null;
    created_at?: string | null;
  }> = [];
  const mainByOs = new Map<string, string>();

  if (osIds.length > 0) {
    const [{ data: sibData }, { data: osData }] = await Promise.all([
      supabase
        .from('series')
        .select('id, serial_number, service_order_id, material, valuation, sap_status, created_at')
        .in('service_order_id', osIds)
        .order('created_at', { ascending: true }),
      supabase.from('service_orders').select('id, main_serial').in('id', osIds),
    ]);
    siblings = sibData ?? [];
    for (const os of osData ?? []) {
      if (os.main_serial) mainByOs.set(String(os.id), String(os.main_serial));
    }
  }

  const byOs = new Map<string, typeof siblings>();
  for (const s of siblings) {
    const key = String(s.service_order_id);
    if (!byOs.has(key)) byOs.set(key, []);
    byOs.get(key)!.push(s);
  }

  const enriched: DespachoBoxItem[] = [];
  const processed = new Set<string>();

  for (const item of inBox) {
    const osId = item.service_order_id ? String(item.service_order_id) : null;
    if (osId && processed.has(osId)) continue;

    if (osId) {
      processed.add(osId);
      const sibs = byOs.get(osId) ?? [item];
      const { material, valuation } = coalesceMaterialLote(sibs);
      const slots = buildEquipmentSerialSlots(
        sibs.map((s) => ({
          id: String(s.id),
          serial_number: s.serial_number,
          material: s.material,
          valuation: s.valuation,
          sap_status: s.sap_status,
          created_at: s.created_at,
        })),
        mainByOs.get(osId)
      );
      enriched.push({
        id: slots.primary.id || item.id,
        serial_number: slots.s1 || item.serial_number,
        s1: slots.s1 || item.serial_number,
        s2: slots.s2,
        s3: slots.s3,
        s4: slots.s4,
        material,
        valuation,
        service_order_id: osId,
      });
    } else {
      enriched.push({
        id: item.id,
        serial_number: item.serial_number,
        s1: item.serial_number,
        s2: '',
        s3: '',
        s4: '',
        material: item.material ?? '',
        valuation: item.valuation ?? '',
      });
    }
  }

  return enriched;
}

async function loadBoxItems(boxDbId: string): Promise<DespachoBoxItem[]> {
  try {
    const items = await fetchDespachoBoxItems(boxDbId);
    if (items.length > 0) return items;
  } catch (e) {
    console.warn('[despacho] items API failed, supabase fallback:', e);
  }
  return loadBoxItemsViaSupabase(boxDbId);
}

export function DespachoSalidaModal({ boxes, dispatchType = 'master_box', onClose, onDone }: Props) {
  const [channel, setChannel] = useState<ClientChannel>('CAC');
  const [clientId, setClientId] = useState('');
  const [trasladoSap, setTrasladoSap] = useState('');
  const [notaEntrega, setNotaEntrega] = useState('');
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadingClients, setLoadingClients] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printOnDispatch, setPrintOnDispatch] = useState(true);
  const [numeroSalida, setNumeroSalida] = useState('');
  const [detailByBox, setDetailByBox] = useState<Record<string, DespachoBoxItem[]>>({});
  const [pxClients, setPxClients] = useState<CatalogOption[]>([]);
  const [cacClients, setCacClients] = useState<CatalogOption[]>([]);

  const boxIdsKey = useMemo(() => boxes.map((b) => b.dbId).sort().join('|'), [boxes]);

  const ensureNumeroSalida = async (forced?: string): Promise<string> => {
    if (forced?.trim()) {
      setNumeroSalida(forced.trim());
      return forced.trim();
    }
    if (numeroSalida.trim()) return numeroSalida.trim();
    const code = await allocateSalidaCode();
    setNumeroSalida(code);
    return code;
  };

  const buildLabelInputs = (targetBoxes: SalidaBoxSummary[]) =>
    targetBoxes.map((b) => ({
      outboundCode: b.id,
      brandName: b.brandName || 'N/A',
      modelName: b.modelName || 'N/A',
      techName: b.techName || 'N/A',
      capacity: Number(b.unidades) || detailByBox[b.dbId]?.length || 0,
      boxMaterial: b.material,
      boxValuation: b.valuation,
      items: detailByBox[b.dbId] || [],
    }));

  const buildDetalleRows = (targetBoxes: SalidaBoxSummary[]) => {
    if (dispatchType === 'individual') {
      const rows: Array<{
        outboundCode: string;
        brandName?: string;
        modelName?: string;
        techName?: string;
        cantidad: number;
        material?: string;
        valuation?: string;
        series: string[];
      }> = [];
      for (const b of targetBoxes) {
        const items = detailByBox[b.dbId] || [];
        if (items.length === 0) {
          const preview = (b.series_preview || [])
            .map((s) => String(s || '').trim())
            .filter(Boolean);
          rows.push({
            outboundCode: b.id,
            brandName: b.brandName,
            modelName: b.modelName,
            techName: b.techName,
            cantidad: Number(b.filled_count ?? b.unidades) || preview.length || 1,
            material: b.material,
            valuation: b.valuation,
            series: preview,
          });
          continue;
        }
        for (const item of items) {
          const sn = String(item.serial_number || item.s1 || '').trim();
          rows.push({
            outboundCode: b.id,
            brandName: b.brandName,
            modelName: b.modelName,
            techName: b.techName,
            cantidad: 1,
            material: item.material || b.material,
            valuation: item.valuation || b.valuation,
            series: sn ? [sn] : [],
          });
        }
      }
      return rows;
    }
    return targetBoxes.map((b) => ({
      outboundCode: b.id,
      brandName: b.brandName,
      modelName: b.modelName,
      techName: b.techName,
      cantidad: detailByBox[b.dbId]?.length || Number(b.filled_count ?? 0),
      material: b.material,
      valuation: b.valuation,
    }));
  };

  const handlePrintDetalle = async (
    targetBoxes: SalidaBoxSummary[] = boxes,
    opts?: { numeroSalida?: string }
  ) => {
    if (loadingDetail) {
      notify.warning('Espere a que cargue el detalle.');
      return;
    }
    if (targetBoxes.length === 0) {
      notify.warning('No hay Outbound para imprimir.');
      return;
    }
    setPrinting(true);
    try {
      if (!trasladoSap.trim() || !notaEntrega.trim()) {
        notify.warning('Complete Traslado SAP y Nota de Entrega para el conduce.');
      }
      const ns = await ensureNumeroSalida(opts?.numeroSalida);
      const fechaSalida = new Date().toLocaleString('es-PA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      await printOutboundDetalle(buildDetalleRows(targetBoxes), {
        fechaSalida,
        numeroSalida: ns,
        trasladoSap: trasladoSap.trim() || undefined,
        notaEntrega: notaEntrega.trim() || undefined,
        destino: destinoLabel || undefined,
        origen: 'Tech Corps Guatemala S.A.',
        includeSeries: dispatchType === 'individual',
      });
    } catch (e: any) {
      notify.error('No se pudo generar el Número de Salida', {
        description: e?.message || 'Aplique la migración 116 en Supabase e intente de nuevo.',
      });
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintEtiquetas = async (targetBoxes: SalidaBoxSummary[] = boxes) => {
    if (loadingDetail) {
      notify.warning('Espere a que cargue el detalle.');
      return;
    }
    setPrinting(true);
    try {
      await printOutboundLabels(buildLabelInputs(targetBoxes), {
        onEmpty: () => notify.warning('No hay equipos en el Outbound para imprimir.'),
        onBarcodeError: () => notify.error('No se pudo generar la etiqueta de impresión.'),
      });
    } finally {
      setPrinting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingClients(true);
      try {
        const [px, agencies] = await Promise.all([getPxProviders(), getAgencies()]);
        if (cancelled) return;
        setPxClients(
          (px || []).map((p: any) => ({
            id: String(p.id),
            code: p.code ? String(p.code) : undefined,
            name: String(p.name || ''),
          }))
        );
        setCacClients(
          (agencies || []).map((a: any) => ({
            id: String(a.id),
            code: a.code ? String(a.code) : undefined,
            name: String(a.name || ''),
          }))
        );
      } catch (e) {
        console.warn('[despacho] clients catalog:', e);
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingDetail(true);
      const entries = await Promise.all(
        boxes.map(async (b) => {
          const items = await loadBoxItems(b.dbId);
          return [b.dbId, items] as const;
        })
      );
      if (cancelled) return;
      const map: Record<string, DespachoBoxItem[]> = {};
      for (const [id, items] of entries) map[id] = items;
      setDetailByBox(map);
      setLoadingDetail(false);
    })();
    return () => {
      cancelled = true;
    };
    // boxIdsKey evita re-fetch por re-render del padre con nuevo array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxIdsKey]);

  const clientOptions = channel === 'PX' ? pxClients : cacClients;

  const selectedClient = useMemo(
    () => clientOptions.find((c) => c.id === clientId) || null,
    [clientOptions, clientId]
  );

  const destinoLabel = useMemo(() => {
    if (!selectedClient) return '';
    const prefix = channel === 'PX' ? 'PX' : 'CAC';
    return `${prefix}: ${selectedClient.name}`;
  }, [channel, selectedClient]);

  const totals = useMemo(() => {
    let equipos = 0;
    let valorados = 0;
    let novalorados = 0;
    let completas = 0;

    for (const b of boxes) {
      const items = detailByBox[b.dbId];
      const hasDetail = Array.isArray(items) && items.length > 0;

      if (hasDetail) {
        equipos += items.length;
        for (const it of items) {
          const k = classifyValuation(it.valuation || b.valuation);
          if (k === 'valorado') valorados += 1;
          else if (k === 'novalorado') novalorados += 1;
        }
        if (isBoxComplete(b, items.length)) completas += 1;
      } else {
        const filled = Number(b.filled_count ?? 0);
        equipos += filled;
        const listedVal = Number(b.valorado_count ?? 0);
        const listedNo = Number(b.novalorado_count ?? 0);
        if (listedVal + listedNo > 0) {
          valorados += listedVal;
          novalorados += listedNo;
        } else if (filled > 0) {
          const k = classifyValuation(b.valuation);
          if (k === 'valorado') valorados += filled;
          else if (k === 'novalorado') novalorados += filled;
        }
        if (isBoxComplete(b, filled)) completas += 1;
      }
    }

    return { cajas: boxes.length, equipos, valorados, novalorados, completas };
  }, [boxes, detailByBox]);

  const handleConfirm = async () => {
    if (!selectedClient || !destinoLabel) {
      notify.warning('Seleccione un cliente PX o CAC.');
      return;
    }
    if (!trasladoSap.trim()) {
      notify.warning('Indique el número de Traslado SAP.');
      return;
    }
    if (!notaEntrega.trim()) {
      notify.warning('Indique la Nota de Entrega.');
      return;
    }

    const countOf = (b: SalidaBoxSummary) =>
      detailByBox[b.dbId]?.length || Number(b.filled_count ?? 0);

    const empty = boxes.filter((b) => countOf(b) <= 0);
    if (empty.length > 0) {
      notify.error('Hay cajas vacías', {
        description: `${empty.map((b) => b.id).join(', ')}. Llene la caja antes de despachar.`,
      });
      return;
    }

    const incomplete = boxes.filter((b) => !isBoxComplete(b, countOf(b)));
    if (incomplete.length > 0) {
      notify.warning('Hay cajas incompletas', {
        description: `${incomplete.map((b) => `${b.id} (${countOf(b)}/${b.unidades})`).join(', ')}. Complete la capacidad antes de despachar.`,
        duration: 0,
      });
      return;
    }

    setSubmitting(true);
    const errors: string[] = [];
    const okBoxes: SalidaBoxSummary[] = [];

    let ns: string;
    try {
      ns = await ensureNumeroSalida();
    } catch (e: any) {
      setSubmitting(false);
      notify.error('No se pudo generar el Número de Salida', {
        description: e?.message || 'Aplique la migración 116 en Supabase e intente de nuevo.',
      });
      return;
    }

    const guide = ns;
    const dest = `${destinoLabel} · SAP: ${trasladoSap.trim()} · NE: ${notaEntrega.trim()}`;

    for (const b of boxes) {
      const result = await dispatchBoxFromWarehouse(b.dbId, dest, undefined, undefined, guide);
      if (result.error) {
        errors.push(`${b.id}: ${result.error}`);
        continue;
      }
      okBoxes.push(b);
    }

    setSubmitting(false);

    if (okBoxes.length > 0) {
      notify.success(`${okBoxes.length} caja(s) despachada(s). Nº Salida ${ns}`);
      await handlePrintDetalle(okBoxes, { numeroSalida: ns });
      if (printOnDispatch) {
        await handlePrintEtiquetas(okBoxes);
      }
    }
    if (errors.length > 0) {
      notify.error('Algunas cajas fallaron', {
        description: errors.slice(0, 4).join(' · '),
        duration: 0,
      });
    }
    if (okBoxes.length > 0) onDone();
  };

  return (
    <div className="fixed inset-0 bg-[#0b0e20]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col bg-[var(--surface)] shadow-2xl animate-in zoom-in-95">
        <div className="p-5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-hover)] text-[var(--heading)]">
          <div className="flex items-center gap-3">
            <div className="bg-[var(--accent)]/10 p-2 rounded-xl">
              <Truck className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Despacho Outbound</h2>
              <p className="text-[var(--muted)] text-xs">Confirme Traslado SAP, Nota de Entrega y cliente PX/CAC</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]" disabled={submitting}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-[var(--surface-hover)] rounded-xl p-3 border border-[var(--border)]">
              <div className={`text-[10px] font-black uppercase tracking-widest ${erpTableHeaderText}`}>Outbound</div>
              <div className="text-2xl font-black text-[var(--heading)]">{totals.cajas}</div>
            </div>
            <div className="bg-[var(--surface-hover)] rounded-xl p-3 border border-[var(--border)]">
              <div className={`text-[10px] font-black uppercase tracking-widest ${erpTableHeaderText}`}>Equipos</div>
              <div className="text-2xl font-black text-[var(--heading)]">
                {loadingDetail ? '…' : totals.equipos}
              </div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
              <div className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Valorados</div>
              <div className="text-2xl font-black text-emerald-700">
                {loadingDetail ? '…' : totals.valorados}
              </div>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <div className="text-[10px] font-black uppercase text-amber-600 tracking-widest">No valorados</div>
              <div className="text-2xl font-black text-amber-700">
                {loadingDetail ? '…' : totals.novalorados}
              </div>
            </div>
            <div className="bg-sky-50 rounded-xl p-3 border border-sky-100 col-span-2 sm:col-span-1">
              <div className="text-[10px] font-black uppercase text-sky-600 tracking-widest">Completas</div>
              <div className="text-2xl font-black text-sky-700">
                {loadingDetail ? '…' : `${totals.completas}/${totals.cajas}`}
              </div>
            </div>
          </div>

          {!loadingDetail && totals.equipos === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 font-medium">
              Las cajas seleccionadas no tienen equipos pistoleados. Vuelva a llenar la caja antes de despachar.
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={erpLabelClass}>Traslado SAP *</label>
              <input
                type="text"
                value={trasladoSap}
                onChange={(e) => setTrasladoSap(e.target.value)}
                placeholder="Ej: 4900123456"
                className={`${erpFieldClass} font-mono`}
              />
            </div>
            <div className="space-y-1.5">
              <label className={erpLabelClass}>Nota de Entrega *</label>
              <input
                type="text"
                value={notaEntrega}
                onChange={(e) => setNotaEntrega(e.target.value)}
                placeholder="Ej: NE-000123"
                className={`${erpFieldClass} font-mono`}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={erpLabelClass}>Canal *</label>
              <div className={`${erpTab.list} w-full`}>
                {(['PX', 'CAC'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setChannel(c);
                      setClientId('');
                    }}
                    className={[
                      erpTab.trigger,
                      'flex-1 py-2.5 text-xs',
                      channel === c ? erpTab.triggerActive : erpTab.triggerInactive,
                    ].join(' ')}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={erpLabelClass}>
                {channel === 'PX' ? 'Cliente / Proveedor PX *' : 'Cliente / Agencia CAC *'}
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={loadingClients}
                className={erpFieldClass}
              >
                <option value="">
                  {loadingClients
                    ? 'Cargando lista…'
                    : channel === 'PX'
                      ? 'Seleccione proveedor PX…'
                      : 'Seleccione agencia CAC…'}
                </option>
                {clientOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
              {!loadingClients && clientOptions.length === 0 && (
                <p className="text-[11px] text-amber-600 font-medium">
                  No hay {channel === 'PX' ? 'proveedores PX' : 'agencias CAC'} en catálogo. Revise Configuración.
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Package className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <h3 className="text-xs font-black uppercase tracking-widest text-[var(--heading)]">
                  Detalle de Outbound
                </h3>
                {numeroSalida ? (
                  <span className="font-mono text-[11px] font-black text-[var(--heading)] bg-[var(--surface-hover)] border border-[var(--border)] px-2 py-0.5 rounded-lg">
                    {numeroSalida}
                  </span>
                ) : null}
                {loadingDetail && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingDetail || printing || totals.equipos === 0}
                onClick={() => void handlePrintDetalle()}
                leftIcon={
                  printing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />
                }
              >
                {printing ? 'Imprimiendo…' : 'Imprimir detalle'}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className={erpTableHeader}>
                    <th className={`px-3 py-2 text-[10px] font-black uppercase tracking-wide ${erpTableHeaderText}`}>Outbound</th>
                    <th className={`px-3 py-2 text-[10px] font-black uppercase tracking-wide ${erpTableHeaderText}`}>Marca</th>
                    <th className={`px-3 py-2 text-[10px] font-black uppercase tracking-wide ${erpTableHeaderText}`}>Modelo</th>
                    <th className={`px-3 py-2 text-[10px] font-black uppercase tracking-wide ${erpTableHeaderText}`}>Tecnologia</th>
                    <th className={`px-3 py-2 text-[10px] font-black uppercase tracking-wide ${erpTableHeaderText}`}>Cantidad</th>
                    <th className={`px-3 py-2 text-[10px] font-black uppercase tracking-wide ${erpTableHeaderText}`}>Material</th>
                    <th className={`px-3 py-2 text-[10px] font-black uppercase tracking-wide ${erpTableHeaderText}`}>Valoracion</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.map((b) => {
                    const count = detailByBox[b.dbId]?.length || Number(b.filled_count ?? 0);
                    const valRaw = String(b.valuation || '').trim();
                    const isNoVal = /novalorad|no\s*valorad/i.test(valRaw);
                    const isVal = /valorado/i.test(valRaw) && !isNoVal;
                    const valLabel = isVal ? 'Valorado' : isNoVal || valRaw ? 'No Valorado' : '—';
                    const outboundDigits = String(b.id).replace(/\D/g, '') || b.id;
                    const outboundNum = outboundDigits.padStart(6, '0');
                    return (
                      <tr key={b.dbId} className="border-b border-slate-50 last:border-0">
                        <td className="px-3 py-2.5 text-sm font-mono font-bold text-[var(--heading)]">{outboundNum}</td>
                        <td className="px-3 py-2.5 text-sm font-bold text-[var(--heading)]">{b.brandName || '—'}</td>
                        <td className="px-3 py-2.5 text-sm font-bold text-[var(--heading)]">{b.modelName || '—'}</td>
                        <td className="px-3 py-2.5 text-sm font-bold text-[var(--heading)]">{b.techName || '—'}</td>
                        <td className="px-3 py-2.5 text-sm font-bold text-[var(--heading)]">
                          {loadingDetail ? '…' : count}
                        </td>
                        <td className="px-3 py-2.5 text-sm font-mono font-bold text-[var(--heading)]">
                          {b.material || '—'}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-sm font-bold ${
                            isVal ? 'text-emerald-700' : isNoVal ? 'text-amber-700' : 'text-[var(--heading)]'
                          }`}
                        >
                          {valLabel}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <div className="p-5 border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[var(--surface-hover)]">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={printOnDispatch}
              onChange={(e) => setPrintOnDispatch(e.target.checked)}
              className="rounded border-[var(--border)] accent-[var(--accent)] focus:ring-[var(--accent)]"
            />
            También imprimir etiquetas TSC al despachar
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={submitting || printing}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={submitting || printing || loadingDetail || loadingClients || boxes.length === 0 || totals.equipos === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              leftIcon={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
            >
              {submitting
                ? 'Despachando…'
                : printOnDispatch
                  ? `Despachar e imprimir ${boxes.length}`
                  : `Despachar ${boxes.length} Outbound`}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

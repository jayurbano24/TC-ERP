"use client";

import { useState } from "react";
import { Search, Loader2, Package, MapPin, Calendar, Clock, User, Activity, AlertCircle, CheckCircle, XCircle, Eraser, History, BookOpen } from "lucide-react";
import { searchSeriesDetailed } from "@/modules/traceability/client/series";
import {
  fetchCacTrayContext,
  getEquipmentTraceabilityHistory,
  resolveTraceabilityResponsibles,
  resolveTraceabilityStatusLabel,
  type TraceabilityEvent,
} from "@/modules/traceability/client/traceability";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatIngresoLabel } from "@/modules/recepcion/client/receptions";

type IngresoCycle = {
  id: string;
  os_label: string | null;
  main_serial: string | null;
  reentry_count: number;
  status: string | null;
  created_at: string | null;
  closed_at: string | null;
  reception_source: string | null;
  reception_guide: string | null;
  sap_document: string | null;
  serials: string[];
};

export default function ConsultaPage() {
  const [filters, setFilters] = useState({ os: "", imei: "", cliente: "", ticket: "", tracking: "", box: "" });
  const [loading, setLoading] = useState(false);
  const [seriesData, setSeriesData] = useState<any>(null);
  const [siblingSeries, setSiblingSeries] = useState<any[]>([]);
  const [history, setHistory] = useState<TraceabilityEvent[]>([]);
  const [ingresoHistory, setIngresoHistory] = useState<IngresoCycle[]>([]);
  const [detailTab, setDetailTab] = useState<'bitacora' | 'ingresos'>('bitacora');
  const [bitacoraIngresoId, setBitacoraIngresoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadIngresoHistory = async (
    supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
    serials: string[],
    currentOsId?: string | null
  ): Promise<IngresoCycle[]> => {
    const cleaned = [
      ...new Set(
        serials
          .map((s) => String(s || '').trim())
          .filter(Boolean)
          .flatMap((s) => [s, s.toUpperCase(), s.toLowerCase()])
      ),
    ];
    if (!cleaned.length) return [];

    const osIds = new Set<string>();
    if (currentOsId) osIds.add(currentOsId);

    const { data: bySeries } = await supabase
      .from('series')
      .select('id, service_order_id, serial_number')
      .in('serial_number', cleaned);
    const seriesIds: string[] = [];
    for (const row of bySeries || []) {
      if (row.service_order_id) osIds.add(row.service_order_id);
      if (row.id) seriesIds.push(row.id);
    }

    // Case-insensitive: .in exacto falla si el casing del main_serial difiere
    const mainOr = cleaned
      .slice(0, 12)
      .map((s) => `main_serial.ilike.${s.replace(/[,.()]/g, '')}`)
      .join(',');
    if (mainOr) {
      const { data: byMain } = await supabase
        .from('service_orders')
        .select('id')
        .or(mainOr)
        .limit(100);
      for (const row of byMain || []) {
        if (row.id) osIds.add(row.id);
      }
    }

    // OS históricas desde ciclos (aunque la serie ya no apunte a ellas)
    const cycleOr = cleaned
      .slice(0, 12)
      .map((s) => `serial_number.ilike.${s.replace(/[,.()]/g, '')}`)
      .join(',');
    if (cycleOr) {
      const { data: cycleLinks } = await supabase
        .from('service_order_serial_cycles')
        .select('service_order_id')
        .or(cycleOr)
        .limit(200);
      for (const row of cycleLinks || []) {
        if (row.service_order_id) osIds.add(row.service_order_id);
      }
    }

    const idList = [...osIds];
    if (!idList.length) return [];

    const { data: osRows } = await supabase
      .from('service_orders')
      .select(
        `
        id,
        os_label,
        main_serial,
        reentry_count,
        status,
        created_at,
        closed_at,
        reception_id,
        sap_transfer_id,
        reception_guide_id,
        receptions:reception_id (
          source,
          guide_number,
          sap_document
        ),
        sap_transfer_documents:sap_transfer_id (
          sap_document_number
        ),
        reception_guides:reception_guide_id (
          guide_number
        )
      `
      )
      .in('id', idList)
      .order('created_at', { ascending: true });

    const { data: trayRows } = await supabase
      .from('cac_tray_units')
      .select('service_order_id, guide_number, sap_document_number, reentry_count')
      .in('service_order_id', idList);
    const trayByOs = new Map(
      (trayRows || []).map((t) => [String(t.service_order_id), t])
    );

    const { data: linkedSeries } = await supabase
      .from('series')
      .select('service_order_id, serial_number, created_at, sap_transfer_id')
      .in('service_order_id', idList)
      .order('created_at', { ascending: true });

    const serialsByOs = new Map<string, string[]>();
    for (const s of linkedSeries || []) {
      const key = String(s.service_order_id);
      if (!serialsByOs.has(key)) serialsByOs.set(key, []);
      const list = serialsByOs.get(key)!;
      const sn = String(s.serial_number || '').trim();
      if (sn && !list.includes(sn)) list.push(sn);
    }

    // Fallbacks de cierre por ciclo (dispatch / auditoría en ventana del ingreso)
    let dispatchEvents: { at: string }[] = [];
    if (seriesIds.length) {
      const { data: diRows } = await supabase
        .from('dispatch_items')
        .select('series_id, dispatches:dispatch_id(dispatched_at)')
        .in('series_id', seriesIds);
      for (const row of diRows || []) {
        const d = Array.isArray((row as any).dispatches)
          ? (row as any).dispatches[0]
          : (row as any).dispatches;
        if (d?.dispatched_at) dispatchEvents.push({ at: String(d.dispatched_at) });
      }
    }

    let auditEvents: { at: string }[] = [];
    if (seriesIds.length) {
      const { data: audits } = await supabase
        .from('erp_audit_logs')
        .select('created_at')
        .in('record_id', seriesIds.map(String))
        .eq('action', 'DESPACHADO')
        .order('created_at', { ascending: true });
      for (const a of audits || []) {
        if (a.created_at) auditEvents.push({ at: String(a.created_at) });
      }
    }

    const cycles = (osRows || []).map((os: any, idx: number, arr: any[]) => {
      const rec = Array.isArray(os.receptions) ? os.receptions[0] : os.receptions;
      const sapDoc = Array.isArray(os.sap_transfer_documents)
        ? os.sap_transfer_documents[0]
        : os.sap_transfer_documents;
      const rg = Array.isArray(os.reception_guides) ? os.reception_guides[0] : os.reception_guides;
      const tray = trayByOs.get(String(os.id));
      const linked = serialsByOs.get(String(os.id)) || [];
      const serialsForRow =
        linked.length > 0
          ? linked
          : [os.main_serial].filter(Boolean);

      const from = os.created_at ? new Date(os.created_at).getTime() : 0;
      const nextAt = arr[idx + 1]?.created_at
        ? new Date(arr[idx + 1].created_at).getTime()
        : Number.POSITIVE_INFINITY;

      const inWindow = (iso: string) => {
        const t = new Date(iso).getTime();
        return t >= from && t < nextAt;
      };

      let closedAt: string | null = os.closed_at || null;
      if (!closedAt) {
        const candidates = [
          ...dispatchEvents.map((e) => e.at),
          ...auditEvents.map((e) => e.at),
        ]
          .filter(inWindow)
          .sort();
        closedAt = candidates[0] || null;
      }

      // Fuente canónica: SAP del documento vinculado a la OS/serie (no el sap_document del lote).
      const canonicalSap =
        sapDoc?.sap_document_number ||
        tray?.sap_document_number ||
        null;

      // Guía: tray / reception_guide de la OS; evitar guide_number del lote si parece un SAP ajeno.
      const lotGuide = String(rec?.guide_number || '').trim();
      const lotGuideLooksLikeForeignSap =
        Boolean(canonicalSap) &&
        lotGuide.length > 0 &&
        lotGuide !== String(canonicalSap) &&
        /^\d{6,}(-\d+)?$/.test(lotGuide);
      const canonicalGuide =
        tray?.guide_number ||
        rg?.guide_number ||
        (lotGuideLooksLikeForeignSap ? null : lotGuide) ||
        null;

      // Ordinal del historial = posición real entre OS encontradas (no el contador inflado).
      const reentry = idx + 1;

      return {
        id: os.id,
        os_label: os.os_label || null,
        main_serial: os.main_serial || null,
        reentry_count: reentry,
        status: os.status || null,
        created_at: os.created_at || null,
        closed_at: closedAt,
        reception_source: rec?.source || null,
        reception_guide: canonicalGuide,
        sap_document: canonicalSap,
        serials: serialsForRow as string[],
      } satisfies IngresoCycle;
    });

    return cycles;
  };

  const openBitacoraForIngreso = (cycle: IngresoCycle) => {
    setBitacoraIngresoId(cycle.id);
    setDetailTab('bitacora');
  };

  const filteredHistory = (() => {
    if (!bitacoraIngresoId) return history;
    const cycle = ingresoHistory.find((c) => c.id === bitacoraIngresoId);
    if (!cycle?.created_at) return history;
    const from = new Date(cycle.created_at).getTime();
    const cycleIdx = ingresoHistory.findIndex((c) => c.id === bitacoraIngresoId);
    const next = ingresoHistory[cycleIdx + 1];
    const to = cycle.closed_at
      ? new Date(cycle.closed_at).getTime() + 60_000
      : next?.created_at
        ? new Date(next.created_at).getTime()
        : Date.now();
    return history.filter((ev) => {
      const t = new Date(ev.changed_at).getTime();
      return t >= from && t <= to;
    });
  })();

  const bitacoraCycle = bitacoraIngresoId
    ? ingresoHistory.find((c) => c.id === bitacoraIngresoId)
    : null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!filters.os && !filters.imei && !filters.cliente && !filters.ticket && !filters.tracking && !filters.box) return;

    setLoading(true);
    setError(null);
    setSeriesData(null);
    setSiblingSeries([]);
    setHistory([]);
    setIngresoHistory([]);
    setBitacoraIngresoId(null);
    setDetailTab('bitacora');

    try {
      const results = await searchSeriesDetailed({
        os: filters.os.trim(),
        imei: filters.imei.trim(),
        cliente: filters.cliente.trim(),
        ticket: filters.ticket.trim(),
        tracking: filters.tracking.trim(),
        box: filters.box.trim(),
      });
      if (!results || results.length === 0) {
        setError(`No se encontró ningún equipo con los criterios especificados.`);
        setLoading(false);
        return;
      }

      // Encontrar el match exacto si el IMEI es exacto, sino el primero
      let exactMatch = results[0];
      if (filters.imei.trim()) {
        const found = results.find((r: any) => 
          r.serial_number?.toUpperCase() === filters.imei.trim().toUpperCase() ||
          r.s2?.toUpperCase() === filters.imei.trim().toUpperCase() ||
          r.s3?.toUpperCase() === filters.imei.trim().toUpperCase() ||
          r.s4?.toUpperCase() === filters.imei.trim().toUpperCase()
        );
        if (found) exactMatch = found;
      }

      let siblings: any[] = [exactMatch];
      if (exactMatch.service_order_id) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          const { data: sibs } = await supabase
            .from('series')
            .select(
              'id, serial_number, service_order_id, current_status, brand_id, model_id, material, valuation, current_box_id, current_reception_id, created_at, updated_at'
            )
            .eq('service_order_id', exactMatch.service_order_id)
            .order('created_at', { ascending: true });
          if (sibs?.length) siblings = sibs;
        }
      }
      setSiblingSeries(siblings);

      // Si hay hermanas despachadas / en caja, preferir ese estatus OS (evita
      // mostrar QC al buscar MAC S2 cuando S1 ya salió).
      const statusPriority = [
        'dispatched',
        'ready_to_dispatch',
        'in_validation',
        'in_qc',
        'in_workshop',
        'in_control_warehouse',
        'in_central_warehouse',
      ];
      const preferredSibling =
        [...siblings].sort((a, b) => {
          const ia = statusPriority.indexOf(a.current_status);
          const ib = statusPriority.indexOf(b.current_status);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        })[0] || exactMatch;

      if (exactMatch.id) {
        const reception =
          exactMatch.receptions || exactMatch.service_orders?.receptions || null;
        const receptionId =
          exactMatch.current_reception_id ||
          exactMatch.service_orders?.reception_id ||
          reception?.id ||
          null;
        const sapTransferId =
          exactMatch.sap_transfer_id ||
          exactMatch.service_orders?.sap_transfer_id ||
          exactMatch.service_orders?.sap_transfer_documents?.id ||
          null;
        const siblingIds = siblings.map((s: { id: string }) => s.id);

        const trayCtx = exactMatch.service_order_id
          ? await fetchCacTrayContext(exactMatch.service_order_id)
          : null;

        const sapDocumentNumber =
          trayCtx?.sap_document_number ||
          exactMatch.service_orders?.sap_transfer_documents?.sap_document_number ||
          null;
        // Solo guía/SAP de ESTA OS — no todas las guías del lote de recepción.
        const guideNumbers = [
          trayCtx?.guide_number,
          sapDocumentNumber,
        ].filter(Boolean) as string[];

        const equipmentSerials = siblings
          .flatMap((s: any) => [s.serial_number, s.s2, s.s3, s.s4])
          .filter(Boolean) as string[];

        const hist = await getEquipmentTraceabilityHistory({
          seriesIds: siblingIds,
          serviceOrderId: exactMatch.service_order_id,
          receptionId,
          sapTransferId,
          boxId: preferredSibling.current_box_id || exactMatch.current_box_id,
          guideNumbers,
          sapDocumentNumber,
          osLabel: exactMatch.service_orders?.os_label || null,
          receptionNotes: reception?.notes || null,
          equipmentSerials,
        });
        setHistory(hist);

        const supabase = getSupabaseBrowserClient();
        let outboundDispatch: {
          guide_number: string;
          dispatched_at: string | null;
          dispatch_id: string | null;
        } | null = null;

        if (supabase) {
          const knownSerials = [
            ...equipmentSerials,
            exactMatch.serial_number,
            exactMatch.service_orders?.main_serial,
          ].filter(Boolean) as string[];
          const ingresos = await loadIngresoHistory(
            supabase,
            knownSerials,
            exactMatch.service_order_id
          );
          // Si un ciclo viejo quedó sin series vinculadas, adjuntar las del equipo actual
          const withSerials = ingresos.map((cycle) => ({
            ...cycle,
            serials:
              cycle.serials.length > 0
                ? cycle.serials
                : siblings.map((s) => s.serial_number).filter(Boolean),
          }));
          setIngresoHistory(withSerials);

          // Conduce de salida (despacho) del equipo / OS completo
          if (siblingIds.length > 0) {
            const { data: diRows } = await supabase
              .from('dispatch_items')
              .select(
                'series_id, created_at, dispatches:dispatch_id(id, guide_number, dispatched_at, notes)'
              )
              .in('series_id', siblingIds)
              .order('created_at', { ascending: false })
              .limit(20);

            type DispatchLite = {
              id?: string;
              guide_number?: string | null;
              dispatched_at?: string | null;
            };
            let best: DispatchLite | null = null;
            let bestAt = 0;
            for (const row of diRows || []) {
              const d = (
                Array.isArray((row as { dispatches?: DispatchLite | DispatchLite[] }).dispatches)
                  ? (row as { dispatches: DispatchLite[] }).dispatches[0]
                  : (row as { dispatches?: DispatchLite }).dispatches
              ) as DispatchLite | undefined;
              const guide = String(d?.guide_number || '').trim();
              if (!guide) continue;
              const at = new Date(d?.dispatched_at || (row as { created_at?: string }).created_at || 0).getTime();
              if (at >= bestAt) {
                bestAt = at;
                best = d || null;
              }
            }
            if (best?.guide_number) {
              outboundDispatch = {
                guide_number: String(best.guide_number).trim(),
                dispatched_at: best.dispatched_at || null,
                dispatch_id: best.id || null,
              };
            }

            // Fallback: movimiento SALIDA de bodega con guide_number (TC-INV-…)
            if (!outboundDispatch) {
              const { data: salidaRows } = await supabase
                .from('warehouse_movements')
                .select('guide_number, target_location, created_at')
                .eq('movement_type', 'SALIDA')
                .overlaps('series_ids', siblingIds)
                .order('created_at', { ascending: false })
                .limit(5);
              for (const mov of salidaRows || []) {
                const g = String(mov.guide_number || mov.target_location || '').trim();
                if (g && /^TC-INV-/i.test(g)) {
                  outboundDispatch = {
                    guide_number: g,
                    dispatched_at: mov.created_at || null,
                    dispatch_id: null,
                  };
                  break;
                }
              }
            }
          }
        }

        const isDispatched =
          (preferredSibling.current_status ?? exactMatch.current_status) === 'dispatched';

        setSeriesData({
          ...exactMatch,
          current_status: preferredSibling.current_status ?? exactMatch.current_status,
          current_box_id: isDispatched
            ? null
            : preferredSibling.current_box_id ?? exactMatch.current_box_id,
          boxes: isDispatched || !preferredSibling.current_box_id ? null : exactMatch.boxes,
          receptions: reception,
          _trayCtx: trayCtx,
          _outboundDispatch: outboundDispatch,
        });
      } else {
        setSeriesData(exactMatch);
      }
    } catch (err: any) {
      console.error(err);
      setError("Ocurrió un error al consultar el equipo.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (!status) return 'bg-gray-800 text-gray-300 border-gray-700';
    switch (status) {
      case 'INGRESADO': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'RECEPCIONADO_BODEGA_GENERAL': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'DIAGNOSTICO': 
      case 'in_workshop': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'REACONDICIONADO': 
      case 'in_refurbish': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'REPARACION_N3': 
      case 'in_repair': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'in_qc': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'in_l3':
      case 'in_control_warehouse': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'CONTROL_CALIDAD': 
      case 'in_validation': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'ready_to_dispatch': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'CC_APROBADO': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'CC_RECHAZADO': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'SCRAP': 
      case 'scrap': return 'bg-red-900/30 text-red-500 border-red-500/30';
      case 'KITTEO': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'dispatched':
      case 'DESPACHADO':
      case 'DESPACHADO_BODEGA':
      case 'DESPACHADO_TALLER': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      default: return 'bg-gray-800 text-gray-300 border-gray-700';
    }
  };

  const getStatusLabel = (status: string) => resolveTraceabilityStatusLabel(status).toUpperCase();

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const extractField = (notes: string, field: string) => {
    if (!notes) return null;
    const regex = new RegExp(`${field}:\\s*([^\\n]+)`, 'i');
    const match = notes.match(regex);
    return match ? match[1].trim() : null;
  };

  const trayCtx = seriesData?._trayCtx;
  const receptionProfileName =
    seriesData?.receptions?.received_by_profile?.full_name || null;

  const inferGuideFromNotes = (series: any) => {
    if (trayCtx?.guide_number) return trayCtx.guide_number;
    if (!series || !series.receptions) return 'N/A';

    if (series.receptions.reception_guides?.length > 0) {
      const techName = series.models?.technologies?.name?.toLowerCase() || '';
      let targetCategory = 'equipo';
      if (techName.includes('móvil') || techName.includes('telefono') || techName.includes('teléfono')) {
        targetCategory = 'telefono';
      } else if (techName.includes('accesorio')) {
        targetCategory = 'accesorio';
      }
      const matchedGuide = series.receptions.reception_guides.find(
        (rg: any) => (rg.category || '').toLowerCase() === targetCategory
      );
      if (matchedGuide?.guide_number) return matchedGuide.guide_number;

      if (series.receptions.reception_guides.length === 1) {
        return series.receptions.reception_guides[0].guide_number;
      }
    }

    if (series.receptions.source !== 'cac') return series.receptions.guide_number;

    const techName = series.models?.technologies?.name?.toLowerCase() || '';
    let targetCategory = '';
    if (techName.includes('móvil') || techName.includes('telefono') || techName.includes('teléfono')) {
      targetCategory = 'teléfono';
    } else if (techName.includes('accesorio')) {
      targetCategory = 'accesorio';
    } else {
      targetCategory = 'equipo';
    }

    const notes = series.receptions.notes || '';
    const regex = /\[Guía (.*?)\]([\s\S]*?)(?=\[Guía|---|$)/g;
    let match;
    while ((match = regex.exec(notes)) !== null) {
      const guideName = match[1];
      const blockContent = match[2].toLowerCase();
      if (blockContent.includes(`backoffice_category: ${targetCategory}`)) {
        return guideName;
      }
    }

    if (series.receptions.processed_guides?.length === 1) {
      return series.receptions.processed_guides[0];
    }
    if (series.receptions.processed_guides?.length > 0) {
      return series.receptions.processed_guides.join(', ');
    }

    return series.receptions.guide_number;
  };

  const responsibles = resolveTraceabilityResponsibles(history, {
    receptionNotes: seriesData?.receptions?.notes || null,
    receptionProfileName,
    receptionGuideNumber: inferGuideFromNotes(seriesData),
    trayReceivedByName: trayCtx?.received_by_name || null,
    receptionTime: seriesData?.receptions?.reception_time || null,
    receptionCreatedAt: seriesData?.receptions?.created_at || null,
    trayClassifiedAt: trayCtx?.classified_at || null,
    isPx: (seriesData?.receptions?.source || '').toLowerCase().includes('px'),
  });

  const formatResponsibleDate = (iso: string) => (iso ? formatDate(iso) : '-');

  const recepcionNombre = responsibles.receptionName;
  const recepcionFecha = formatResponsibleDate(responsibles.receptionDate);
  const recepcionGuia = responsibles.receptionGuideNumber;
  const backofficeNombre = responsibles.backofficeName;
  const backofficeFecha = formatResponsibleDate(responsibles.backofficeDate);
  const bodegaNombre = responsibles.warehouseName;
  const bodegaFecha = formatResponsibleDate(responsibles.warehouseDate);

  const isPxReception = (seriesData?.receptions?.source || '').toLowerCase().includes('px');

  const extractAgency = (receptions: any) => {
    if (!receptions) return 'N/A';

    // PX: la "agencia" real es el Proveedor PX (carrier). El campo "Agencia: ..."
    // en notes es un valor por defecto (p. ej. "Monte Verdes") y no representa al proveedor.
    if ((receptions.source || '').toLowerCase().includes('px')) {
      const proveedor = receptions.notes
        ? receptions.notes.split('Proveedor PX: ')[1]?.split('\n')[0]?.trim()
        : null;
      return proveedor || receptions.carrier || 'N/A';
    }

    if (trayCtx?.agency_name) return trayCtx.agency_name;

    // Fase 5: leer desde reception_guides.agency (fuente de verdad)
    if (receptions.reception_guides?.length > 0) {
      const rg = receptions.reception_guides.find((g: any) => g.agency);
      if (rg?.agency) return rg.agency;
    }

    // Fallback histórico: parsear notes
    if (receptions.notes) {
      const parsedAgency = receptions.notes.split('Backoffice_Agency: ')[1]?.split('\n')[0]?.trim();
      if (parsedAgency) return parsedAgency;

      const parsedAgencia = receptions.notes.split('Agencia: ')[1]?.split('\n')[0]?.trim();
      if (parsedAgencia) return parsedAgencia;
    }

    if (receptions.source === 'cac') return receptions.carrier || 'CENTRAL DE ATENCIÓN AL CLIENTE (CAC)';

    return receptions.carrier || 'N/A';
  };

  const clearFilters = () => {
    setFilters({ os: "", imei: "", cliente: "", ticket: "", tracking: "", box: "" });
    setSeriesData(null);
    setSiblingSeries([]);
    setHistory([]);
    setError(null);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--heading)] flex items-center gap-3">
          <Activity className="h-8 w-8 text-[var(--accent)]" />
          Consulta y Trazabilidad de Equipos
        </h1>
        <p className="text-[var(--muted)] text-lg">
          Busca un equipo utilizando múltiples criterios para rastrear todos sus movimientos, responsables y bitácora de estados.
        </p>
      </div>

      {/* Buscador Avanzado */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-xl overflow-hidden">
        <div className="p-4 bg-[var(--surface-hover)] border-b border-[var(--border)] font-bold text-[var(--foreground)] flex items-center gap-2 text-sm">
          <Search className="w-4 h-4 text-[var(--muted)]" /> CONSULTAR ORDEN.
        </div>
        <form onSubmit={handleSearch} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">ORDEN DE SERVICIOS</label>
              <input
                type="text"
                value={filters.os}
                onChange={(e) => setFilters(prev => ({ ...prev, os: e.target.value.toUpperCase() }))}
                className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                placeholder="Ej. TC-0001"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">S.N. / IMEI / S2 / S3 / S4</label>
              <input
                type="text"
                value={filters.imei}
                onChange={(e) => setFilters(prev => ({ ...prev, imei: e.target.value.toUpperCase() }))}
                className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                placeholder="Ej. IMEI..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">CLIENTE / AGENCIA</label>
              <input
                type="text"
                value={filters.cliente}
                onChange={(e) => setFilters(prev => ({ ...prev, cliente: e.target.value.toUpperCase() }))}
                className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">TICKET (SAP)</label>
              <input
                type="text"
                value={filters.ticket}
                onChange={(e) => setFilters(prev => ({ ...prev, ticket: e.target.value.toUpperCase() }))}
                className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">NO. TRACKING / GUÍA</label>
              <input
                type="text"
                value={filters.tracking}
                onChange={(e) => setFilters(prev => ({ ...prev, tracking: e.target.value.toUpperCase() }))}
                className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">NÚMERO DE CAJA (BOX)</label>
              <input
                type="text"
                value={filters.box}
                onChange={(e) => setFilters(prev => ({ ...prev, box: e.target.value.toUpperCase() }))}
                className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                placeholder="Ej. TCW-BOX-045 o BOX-45"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-6">
            <button
              type="button"
              onClick={clearFilters}
              className="px-6 py-2 bg-[var(--surface-hover)] hover:bg-[var(--border)] text-[var(--foreground)] rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 border border-[var(--border)]"
            >
              <Eraser className="w-4 h-4" />
              Limpiar
            </button>
            <button
              type="submit"
              disabled={loading || (!filters.os && !filters.imei && !filters.cliente && !filters.ticket && !filters.tracking && !filters.box)}
              className="px-6 py-2 bg-[var(--accent)] hover:opacity-90 disabled:bg-[var(--surface-hover)] disabled:text-[var(--muted)] text-[var(--accent-foreground)] rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar Equipo
            </button>
          </div>
        </form>

        {error && (
          <div className="mx-6 mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </div>

      {/* Results Section */}
      {seriesData && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Detalles del Equipo */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-xl overflow-hidden">
              <div className="p-4 bg-[var(--surface-hover)] border-b border-[var(--border)] flex items-center gap-3">
                <Package className="h-5 w-5 text-[var(--accent)]" />
                <h2 className="text-lg font-bold text-[var(--heading)]">Detalles del Equipo</h2>
              </div>
              <div className="p-6 space-y-6">
                
                {/* Hardware Info Banner */}
                <div className="bg-[var(--surface-hover)] rounded-xl overflow-hidden border border-[var(--border)] shadow-inner">
                  <table className="w-full text-center whitespace-nowrap">
                    <thead className="bg-[var(--primary)] text-[10px] uppercase font-black tracking-widest text-[var(--primary-foreground)] border-b border-[var(--border)]">
                      <tr>
                        <th className="px-2 py-2">Tecnología</th>
                        <th className="px-2 py-2">Marca</th>
                        <th className="px-2 py-2">Modelo</th>
                      </tr>
                    </thead>
                    <tbody className="bg-[var(--surface)]">
                      <tr>
                        <td className="px-2 py-3 text-cyan-400 font-bold text-xs uppercase">{seriesData.models?.technologies?.name || 'N/A'}</td>
                        <td className="px-2 py-3 text-orange-400 font-bold text-xs uppercase">{seriesData.brands?.name || 'N/A'}</td>
                        <td className="px-2 py-3 text-[var(--accent)] font-bold text-xs uppercase">{seriesData.models?.name || 'N/A'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div>
                  <p className="text-xs text-[var(--muted)] uppercase tracking-wider font-semibold mb-2">Estatus Actual</p>
                  <span className={`px-3 py-1.5 rounded border text-xs font-bold tracking-wide ${getStatusColor(seriesData.current_status)}`}>
                    {getStatusLabel(seriesData.current_status)}
                  </span>
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-[var(--muted)] uppercase font-semibold">Series / Identificadores</p>
                  <div className="bg-[var(--surface-hover)] p-3 rounded-xl border border-[var(--border)] space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-[var(--muted)]">S.N. / IMEI 1:</span>
                      <span className="font-mono text-[var(--foreground)] font-bold">{siblingSeries[0]?.serial_number || seriesData.serial_number || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-[var(--muted)]">Serie 2:</span>
                      <span className="font-mono text-[var(--foreground)] font-medium">{siblingSeries[1]?.serial_number || seriesData.s2 || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-[var(--muted)]">Serie 3:</span>
                      <span className="font-mono text-[var(--foreground)] font-medium">{siblingSeries[2]?.serial_number || seriesData.s3 || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-[var(--muted)]">Serie 4:</span>
                      <span className="font-mono text-[var(--foreground)] font-medium">{siblingSeries[3]?.serial_number || seriesData.s4 || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-t border-[var(--border)] pt-2 mt-2">
                      <span className="text-[var(--muted)]">O.S.:</span>
                      <span className="font-mono text-[var(--accent)] font-bold">{seriesData.service_orders?.os_label || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-[var(--muted)] uppercase font-semibold">Ingreso y Logística</p>
                  <div className="bg-[var(--surface-hover)] p-3 rounded-xl border border-[var(--border)] space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-[var(--muted)]">Origen:</span>
                      <span className="text-[var(--foreground)] font-bold uppercase">{seriesData.receptions?.source || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-[var(--muted)]">{isPxReception ? 'Proveedor PX:' : 'Agencia:'}</span>
                      <span className="text-[var(--foreground)] uppercase text-right max-w-[180px] break-words whitespace-normal">{extractAgency(seriesData.receptions)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-[var(--muted)]">Número de Guías:</span>
                      <span className="text-[var(--foreground)] max-w-[150px] text-right break-words">
                        {inferGuideFromNotes(seriesData)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-[var(--muted)]">Traslado SAP:</span>
                      <span className="text-[var(--foreground)] truncate max-w-[120px]">
                        {seriesData.service_orders?.sap_transfer_documents?.sap_document_number ||
                          trayCtx?.sap_document_number ||
                          seriesData.receptions?.sap_document ||
                          'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-t border-[var(--border)] pt-2 mt-2">
                      <span className="text-[var(--muted)]">Ubicación:</span>
                      <span
                        className={
                          seriesData.boxes?.box_code
                            ? 'text-amber-400 font-bold'
                            : seriesData._outboundDispatch?.guide_number ||
                                seriesData.current_status === 'dispatched'
                              ? 'text-emerald-400 font-bold'
                              : 'text-amber-400 font-bold'
                        }
                      >
                        {seriesData.boxes?.box_code
                          ? seriesData.boxes.box_code
                          : seriesData._outboundDispatch?.guide_number
                            ? `Despachado · ${seriesData._outboundDispatch.guide_number}`
                            : seriesData.current_status === 'dispatched'
                              ? 'Despachado (sin conduce)'
                              : 'Sin Caja'}
                      </span>
                    </div>
                    {(seriesData._outboundDispatch?.guide_number ||
                      seriesData.current_status === 'dispatched') && (
                      <div className="flex justify-between items-center text-sm rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-2">
                        <span className="text-[var(--muted)]">Conduce de Salida:</span>
                        <span className="font-mono font-black text-emerald-400">
                          {seriesData._outboundDispatch?.guide_number || '—'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Personal Involucrado */}
                <div className="space-y-3">
                  <p className="text-xs text-[var(--muted)] uppercase font-semibold">Responsables Iniciales</p>
                  <div className="bg-[var(--surface-hover)] rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
                    <div className="p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] uppercase font-bold text-[var(--muted)]">Recepcionó</span>
                        <span className="text-[10px] text-[var(--muted)]">{recepcionFecha}</span>
                      </div>
                      <div className="text-sm text-[var(--foreground)] truncate">
                        {recepcionNombre}
                      </div>
                      {recepcionGuia && recepcionGuia !== 'N/A' && (
                        <div className="text-[10px] text-[var(--muted)] mt-1 font-mono truncate">
                          Guía: {recepcionGuia}
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] uppercase font-bold text-[var(--muted)]">Backoffice</span>
                        <span className="text-[10px] text-[var(--muted)]">{backofficeFecha}</span>
                      </div>
                      <div className="text-sm text-[var(--foreground)] truncate">
                        {backofficeNombre}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] uppercase font-bold text-[var(--muted)]">Bodega</span>
                        <span className="text-[10px] text-[var(--muted)]">{bodegaFecha}</span>
                      </div>
                      <div className="text-sm text-[var(--foreground)] truncate">
                        {bodegaNombre}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Bitácora / Historial Ingresos */}
          <div className="lg:col-span-3">
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-xl overflow-hidden h-full flex flex-col">
              <div className="p-2 bg-[var(--surface-hover)] border-b border-[var(--border)] flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDetailTab('bitacora')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                    detailTab === 'bitacora'
                      ? 'bg-[var(--surface)] text-emerald-400'
                      : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <MapPin className="h-4 w-4" />
                  Bitácora Estado OS
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('ingresos')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                    detailTab === 'ingresos'
                      ? 'bg-[var(--surface)] text-amber-400'
                      : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <History className="h-4 w-4" />
                  Historial de Ingresos
                  {ingresoHistory.length > 0 && (
                    <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                      {ingresoHistory.length}
                    </span>
                  )}
                </button>
              </div>
              
              <div className="flex-1 overflow-auto p-4">
                {detailTab === 'bitacora' ? (
                  <>
                    {bitacoraCycle && (
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                        <div className="text-xs text-amber-200">
                          <span className="font-black uppercase tracking-widest">
                            Bitácora · {formatIngresoLabel(bitacoraCycle.reentry_count)}
                          </span>
                          <span className="mx-2 text-amber-500/60">·</span>
                          <span className="font-mono font-bold text-[var(--accent)]">
                            {bitacoraCycle.os_label || 'OS'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBitacoraIngresoId(null)}
                          className="text-[10px] font-black uppercase tracking-widest text-amber-300 hover:text-white"
                        >
                          Ver toda la bitácora
                        </button>
                      </div>
                    )}
                  {filteredHistory.length === 0 ? (
                    <div className="text-center py-12">
                      <Activity className="h-12 w-12 text-[var(--muted)] mx-auto mb-4" />
                      <p className="text-[var(--muted)] text-lg">
                        {bitacoraCycle
                          ? 'No hay eventos en la bitácora para este ingreso.'
                          : 'No hay historial de movimientos registrado para este equipo.'}
                      </p>
                    </div>
                  ) : (
                    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                      <table className="w-full text-left text-sm text-[var(--foreground)]">
                        <thead className="bg-[var(--surface-hover)] text-xs uppercase font-bold text-[var(--muted)] border-b border-[var(--border)]">
                          <tr>
                            <th className="px-4 py-3">Fecha / Hora</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3">Técnico</th>
                            <th className="px-4 py-3">Módulo / Origen</th>
                            <th className="px-4 py-3 w-full">Comentario</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
                          {filteredHistory.map((event) => (
                              <tr key={event.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                                <td className="px-4 py-3 text-xs whitespace-nowrap">
                                  <div>{formatDate(event.changed_at)}</div>
                                  <div className="text-[var(--muted)]">{formatTime(event.changed_at)}</div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider ${getStatusColor(event.status)}`}>
                                      {getStatusLabel(event.status)}
                                    </span>
                                </td>
                                <td className="px-4 py-3 font-medium whitespace-nowrap">
                                  {event.actorName === 'SISTEMA' ? 'Enviado por sistema' : event.actorName}
                                </td>
                                <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
                                  {event.module}
                                </td>
                                <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-normal min-w-[250px]">
                                  {event.comment}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  </>
                ) : ingresoHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="h-12 w-12 text-[var(--muted)] mx-auto mb-4" />
                    <p className="text-[var(--muted)] text-lg">No hay ciclos de ingreso registrados para estas series.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {ingresoHistory.length === 1 &&
                      Number(seriesData?.service_orders?.reentry_count) > 1 && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                          Este equipo figuraba como{' '}
                          <strong>{formatIngresoLabel(seriesData.service_orders.reentry_count)}</strong>,
                          pero solo hay <strong>1 ciclo</strong> de OS en el sistema. Suele deberse a un
                          contador inflado o a una OS previa eliminada. Ejecute la migración{' '}
                          <code className="font-mono">169_fix_reentry_count_rank.sql</code> para
                          recalcular.
                        </div>
                      )}
                    <p className="text-xs text-[var(--muted)] uppercase tracking-wider font-semibold">
                      Series del equipo consultado
                    </p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(siblingSeries.length ? siblingSeries : [seriesData]).map((s: any, i: number) => (
                        <span
                          key={`${s.serial_number || i}`}
                          className="font-mono text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[var(--surface-hover)] text-[var(--foreground)] border border-[var(--border)]"
                        >
                          S{i + 1}: {s.serial_number || '—'}
                        </span>
                      ))}
                    </div>

                    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                      <table className="w-full text-left text-sm text-[var(--foreground)]">
                        <thead className="bg-[var(--surface-hover)] text-xs uppercase font-bold text-[var(--muted)] border-b border-[var(--border)]">
                          <tr>
                            <th className="px-4 py-3">Ingreso</th>
                            <th className="px-4 py-3">Fecha ingreso</th>
                            <th className="px-4 py-3">Fecha cierre</th>
                            <th className="px-4 py-3">O.S.</th>
                            <th className="px-4 py-3">Origen</th>
                            <th className="px-4 py-3">Estado OS</th>
                            <th className="px-4 py-3">Series</th>
                            <th className="px-4 py-3">Guía / SAP</th>
                            <th className="px-4 py-3 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
                          {ingresoHistory.map((cycle) => (
                            <tr key={cycle.id} className="hover:bg-[var(--surface-hover)] transition-colors align-top">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${
                                    cycle.reentry_count > 1
                                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                      : 'bg-[var(--surface-hover)] text-[var(--muted)] border-[var(--border)]'
                                  }`}
                                >
                                  {formatIngresoLabel(cycle.reentry_count)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs whitespace-nowrap">
                                <div>{formatDate(cycle.created_at || '')}</div>
                                <div className="text-[var(--muted)]">{formatTime(cycle.created_at || '')}</div>
                              </td>
                              <td className="px-4 py-3 text-xs whitespace-nowrap">
                                {cycle.closed_at ? (
                                  <>
                                    <div>{formatDate(cycle.closed_at)}</div>
                                    <div className="text-[var(--muted)]">{formatTime(cycle.closed_at)}</div>
                                  </>
                                ) : (
                                  <span className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">
                                    Abierto
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono font-bold text-[var(--accent)] whitespace-nowrap">
                                {cycle.os_label || '—'}
                              </td>
                              <td className="px-4 py-3 text-xs uppercase font-bold text-[var(--foreground)] whitespace-nowrap">
                                {cycle.reception_source || '—'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider ${getStatusColor(cycle.status || '')}`}>
                                  {(cycle.status || '—').replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1 min-w-[160px]">
                                  {cycle.serials.length === 0 ? (
                                    <span className="text-[var(--muted)] text-xs">{cycle.main_serial || '—'}</span>
                                  ) : (
                                    cycle.serials.map((sn, i) => (
                                      <span key={`${cycle.id}-${sn}`} className="font-mono text-[11px] text-[var(--foreground)]">
                                        <span className="text-[var(--muted)] mr-1">S{i + 1}</span>
                                        {sn}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
                                <div>{cycle.reception_guide || '—'}</div>
                                <div className="text-[var(--muted)]">{cycle.sap_document || ''}</div>
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => openBitacoraForIngreso(cycle)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                                  title="Ver bitácora de este ingreso"
                                >
                                  <BookOpen className="h-3.5 w-3.5" />
                                  Bitácora
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
}

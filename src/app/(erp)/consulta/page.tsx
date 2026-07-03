"use client";

import { useState } from "react";
import { Search, Loader2, Package, MapPin, Calendar, Clock, User, Activity, AlertCircle, CheckCircle, XCircle, Eraser } from "lucide-react";
import { searchSeriesDetailed } from "@/modules/traceability/client/series";
import {
  fetchCacTrayContext,
  getEquipmentTraceabilityHistory,
  resolveTraceabilityResponsibles,
  resolveTraceabilityStatusLabel,
  type TraceabilityEvent,
} from "@/modules/traceability/client/traceability";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ConsultaPage() {
  const [filters, setFilters] = useState({ os: "", imei: "", cliente: "", ticket: "", tracking: "", box: "" });
  const [loading, setLoading] = useState(false);
  const [seriesData, setSeriesData] = useState<any>(null);
  const [siblingSeries, setSiblingSeries] = useState<any[]>([]);
  const [history, setHistory] = useState<TraceabilityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!filters.os && !filters.imei && !filters.cliente && !filters.ticket && !filters.tracking && !filters.box) return;

    setLoading(true);
    setError(null);
    setSeriesData(null);
    setSiblingSeries([]);
    setHistory([]);

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
        const guideNumbers = [
          ...(reception?.reception_guides?.map((g: { guide_number?: string }) => g.guide_number) ||
            []),
          reception?.guide_number,
        ].filter(Boolean) as string[];

        const trayCtx = exactMatch.service_order_id
          ? await fetchCacTrayContext(exactMatch.service_order_id)
          : null;

        const equipmentSerials = siblings
          .flatMap((s: any) => [s.serial_number, s.s2, s.s3, s.s4])
          .filter(Boolean) as string[];

        const hist = await getEquipmentTraceabilityHistory({
          seriesIds: siblingIds,
          serviceOrderId: exactMatch.service_order_id,
          receptionId,
          sapTransferId,
          boxId: exactMatch.current_box_id,
          guideNumbers,
          receptionNotes: reception?.notes || null,
          equipmentSerials,
        });
        setHistory(hist);
        setSeriesData({
          ...exactMatch,
          receptions: reception,
          _trayCtx: trayCtx,
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
      case 'in_l3': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'CONTROL_CALIDAD': 
      case 'in_qc': 
      case 'in_validation': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'CC_APROBADO': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'CC_RECHAZADO': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'SCRAP': 
      case 'scrap': return 'bg-red-900/30 text-red-500 border-red-500/30';
      case 'KITTEO': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
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
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <Activity className="h-8 w-8 text-blue-500" />
          Consulta y Trazabilidad de Equipos
        </h1>
        <p className="text-slate-400 text-lg">
          Busca un equipo utilizando múltiples criterios para rastrear todos sus movimientos, responsables y bitácora de estados.
        </p>
      </div>

      {/* Buscador Avanzado */}
      <div className="bg-[#0f172a] rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="p-4 bg-slate-900/50 border-b border-slate-800 font-bold text-slate-300 flex items-center gap-2 text-sm">
          <Search className="w-4 h-4 text-slate-400" /> CONSULTAR ORDEN.
        </div>
        <form onSubmit={handleSearch} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ORDEN DE SERVICIOS</label>
              <input
                type="text"
                value={filters.os}
                onChange={(e) => setFilters(prev => ({ ...prev, os: e.target.value.toUpperCase() }))}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="Ej. TC-0001"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">S.N. / IMEI / S2 / S3 / S4</label>
              <input
                type="text"
                value={filters.imei}
                onChange={(e) => setFilters(prev => ({ ...prev, imei: e.target.value.toUpperCase() }))}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="Ej. IMEI..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">CLIENTE / AGENCIA</label>
              <input
                type="text"
                value={filters.cliente}
                onChange={(e) => setFilters(prev => ({ ...prev, cliente: e.target.value.toUpperCase() }))}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">TICKET (SAP)</label>
              <input
                type="text"
                value={filters.ticket}
                onChange={(e) => setFilters(prev => ({ ...prev, ticket: e.target.value.toUpperCase() }))}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">NO. TRACKING / GUÍA</label>
              <input
                type="text"
                value={filters.tracking}
                onChange={(e) => setFilters(prev => ({ ...prev, tracking: e.target.value.toUpperCase() }))}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">NÚMERO DE CAJA (BOX)</label>
              <input
                type="text"
                value={filters.box}
                onChange={(e) => setFilters(prev => ({ ...prev, box: e.target.value.toUpperCase() }))}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="Ej. BX-001"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-6">
            <button
              type="button"
              onClick={clearFilters}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 border border-slate-700"
            >
              <Eraser className="w-4 h-4" />
              Limpiar
            </button>
            <button
              type="submit"
              disabled={loading || (!filters.os && !filters.imei && !filters.cliente && !filters.ticket && !filters.tracking && !filters.box)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
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
            <div className="bg-[#0f172a] rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex items-center gap-3">
                <Package className="h-5 w-5 text-blue-400" />
                <h2 className="text-lg font-bold text-white">Detalles del Equipo</h2>
              </div>
              <div className="p-6 space-y-6">
                
                {/* Hardware Info Banner */}
                <div className="bg-[#1e293b] rounded-xl overflow-hidden border border-slate-700 shadow-inner">
                  <table className="w-full text-center whitespace-nowrap">
                    <thead className="bg-[#0f172a] text-[10px] uppercase font-black tracking-widest text-white border-b border-slate-700">
                      <tr>
                        <th className="px-2 py-2">Tecnología</th>
                        <th className="px-2 py-2">Marca</th>
                        <th className="px-2 py-2">Modelo</th>
                      </tr>
                    </thead>
                    <tbody className="bg-slate-800/50">
                      <tr>
                        <td className="px-2 py-3 text-cyan-400 font-bold text-xs uppercase">{seriesData.models?.technologies?.name || 'N/A'}</td>
                        <td className="px-2 py-3 text-orange-400 font-bold text-xs uppercase">{seriesData.brands?.name || 'N/A'}</td>
                        <td className="px-2 py-3 text-blue-400 font-bold text-xs uppercase">{seriesData.models?.name || 'N/A'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Estatus Actual</p>
                  <span className={`px-3 py-1.5 rounded border text-xs font-bold tracking-wide ${getStatusColor(seriesData.current_status)}`}>
                    {getStatusLabel(seriesData.current_status)}
                  </span>
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-slate-500 uppercase font-semibold">Series / Identificadores</p>
                  <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">S.N. / IMEI 1:</span>
                      <span className="font-mono text-white font-bold">{siblingSeries[0]?.serial_number || seriesData.serial_number || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Serie 2:</span>
                      <span className="font-mono text-white font-medium">{siblingSeries[1]?.serial_number || seriesData.s2 || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Serie 3:</span>
                      <span className="font-mono text-white font-medium">{siblingSeries[2]?.serial_number || seriesData.s3 || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Serie 4:</span>
                      <span className="font-mono text-white font-medium">{siblingSeries[3]?.serial_number || seriesData.s4 || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-t border-slate-700/50 pt-2 mt-2">
                      <span className="text-slate-500">O.S.:</span>
                      <span className="font-mono text-blue-400 font-bold">{seriesData.service_orders?.os_label || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-slate-500 uppercase font-semibold">Ingreso y Logística</p>
                  <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Origen:</span>
                      <span className="text-slate-200 font-bold uppercase">{seriesData.receptions?.source || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">{isPxReception ? 'Proveedor PX:' : 'Agencia:'}</span>
                      <span className="text-slate-200 uppercase text-right max-w-[180px] break-words whitespace-normal">{extractAgency(seriesData.receptions)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Número de Guías:</span>
                      <span className="text-slate-200 max-w-[150px] text-right break-words">
                        {inferGuideFromNotes(seriesData)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Traslado SAP:</span>
                      <span className="text-slate-200 truncate max-w-[120px]">
                        {seriesData.receptions?.sap_document ||
                          seriesData.service_orders?.sap_transfer_documents?.sap_document_number ||
                          trayCtx?.sap_document_number ||
                          'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-t border-slate-700/50 pt-2 mt-2">
                      <span className="text-slate-500">Ubicación:</span>
                      <span className="text-amber-400 font-bold">{seriesData.boxes ? seriesData.boxes.box_code : 'Sin Caja'}</span>
                    </div>
                  </div>
                </div>

                {/* Personal Involucrado */}
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 uppercase font-semibold">Responsables Iniciales</p>
                  <div className="bg-slate-900/50 rounded-xl border border-slate-800 divide-y divide-slate-800">
                    <div className="p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Recepcionó</span>
                        <span className="text-[10px] text-slate-400">{recepcionFecha}</span>
                      </div>
                      <div className="text-sm text-slate-200 truncate">
                        {recepcionNombre}
                      </div>
                      {recepcionGuia && recepcionGuia !== 'N/A' && (
                        <div className="text-[10px] text-slate-400 mt-1 font-mono truncate">
                          Guía: {recepcionGuia}
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Backoffice</span>
                        <span className="text-[10px] text-slate-400">{backofficeFecha}</span>
                      </div>
                      <div className="text-sm text-slate-200 truncate">
                        {backofficeNombre}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Bodega</span>
                        <span className="text-[10px] text-slate-400">{bodegaFecha}</span>
                      </div>
                      <div className="text-sm text-slate-200 truncate">
                        {bodegaNombre}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Bitácora (Columna Derecha) */}
          <div className="lg:col-span-3">
            <div className="bg-[#0f172a] rounded-2xl border border-slate-800 shadow-xl overflow-hidden h-full flex flex-col">
              <div className="p-4 bg-slate-900/50 border-b border-slate-800 font-bold text-slate-300 flex items-center gap-2 text-sm uppercase">
                <MapPin className="h-4 w-4 text-emerald-500" />
                BITÁCORA ESTADO OS
              </div>
              
              <div className="flex-1 overflow-auto p-4">
                {history.length === 0 ? (
                  <div className="text-center py-12">
                    <Activity className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400 text-lg">No hay historial de movimientos registrado para este equipo.</p>
                  </div>
                ) : (
                  <div className="border border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-[#1e293b] text-xs uppercase font-bold text-slate-400 border-b border-slate-700">
                        <tr>
                          <th className="px-4 py-3">Fecha / Hora</th>
                          <th className="px-4 py-3">Estado</th>
                          <th className="px-4 py-3">Técnico</th>
                          <th className="px-4 py-3">Módulo / Origen</th>
                          <th className="px-4 py-3 w-full">Comentario</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 bg-slate-900/20">
                        {history.map((event) => (
                            <tr key={event.id} className="hover:bg-slate-800/50 transition-colors">
                              <td className="px-4 py-3 text-xs whitespace-nowrap">
                                <div>{formatDate(event.changed_at)}</div>
                                <div className="text-slate-500">{formatTime(event.changed_at)}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider ${getStatusColor(event.status)}`}>
                                    {getStatusLabel(event.status)}
                                  </span>
                              </td>
                              <td className="px-4 py-3 font-medium whitespace-nowrap">
                                {event.actorName}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                                {event.module}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-400 whitespace-normal min-w-[250px]">
                                {event.comment}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
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

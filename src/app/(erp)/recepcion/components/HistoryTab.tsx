// @ts-nocheck
"use client";
import React, { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Search, Truck, Clock, Camera, Pencil, Printer, Trash2, Download, ClipboardList, Scan, ChevronDown, ChevronRight, Eye, X, History, Tag, Box } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { notify, confirmDialog, promptDialog, DataTable } from '@/components/ui';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { printingService } from '../services/printingService';
import { groupPxSeriesByEquipment } from '../utils/pxSeriesUtils';
import {
  CAC_HISTORY_PAGE_SIZE,
  ReceptionCacHistoryPagination,
} from './ReceptionCacHistoryPagination';

export const HistoryTab = ({
  moduleMode,
  pxRecords,
  cacRecords,
  searchTerm,
  setSearchTerm,
  filterPilot,
  setFilterPilot,
  showTimeline,
  setShowTimeline,
  timelineActiveGuide,
  setTimelineActiveGuide,
  setPxRecords,
  handlePrintCAC,
  handlePrintPX,
  handlePrintLabelsPX,
  handleDeleteHistoryCAC,
  handleDeleteHistoryPX,
  handleEditHistoryCAC
}: any) => {

  const [showPxDetails, setShowPxDetails] = React.useState<any>(null);

  // C5: el filtrado de historial usa el término debounced (no recalcula PX/CAC
  // ni reagrupa en cada tecla). El input sigue ligado a searchTerm.
  const debouncedSearch = useDebouncedValue(searchTerm, 300);

  // Export report handler
  const handleExportReport = async () => {
    // Prepare rows based on mode
    const rows = moduleMode === 'px'
      ? pxRecords.map(rec => {
          const fecha = rec.fecha_formateada || new Date(rec.created_at).toLocaleString();
          const cajas = rec.notes?.match(/Cajas:\\s*(\\d+)/)?.[1] || '1';
          const equipos = rec.received_units || 0;
          const usuario = (rec.notes?.split('Recibido Por: ')?.[1]?.split('\\n')?.[0]?.trim() || rec.received_by || 'SISTEMA').split('@')[0];
          return { Fecha: fecha, 'Documento SAP': rec.sap_document || '---', 'Nombre Agencia PX': rec.carrier || '---', Usuario: usuario, 'Cant. Cajas': cajas, 'Cantidad Equipos': equipos, Estatus: rec.status === 'ELIMINADO POR BODEGA' ? 'ELIMINADO POR BODEGA' : 'FINALIZADO' };
        })
      : cacRecords.map(rec => {
          const fecha = rec.fecha_formateada || new Date(rec.created_at).toLocaleString();
          const guia = rec.guide_number || rec.id;
          const piloto = rec.pilot_display || '';
          const recibidoMatch = rec.notes?.match(/Recibido Por:\\s+([^\\n]+)/);
          const recibido = recibidoMatch ? recibidoMatch[1].trim().split('@')[0] : (rec.usuario || rec.received_by || 'SISTEMA').split('@')[0];
          const estatus = rec.status === 'ELIMINADO POR BODEGA' ? 'ELIMINADO POR BODEGA' : 'FINALIZADO';
          const isSub = !!rec.notes?.match(/como parte de lote (.*?)\\./);
          let unidades = '-';
          if (!isSub) {
            const allGuias = rec.allGuias || [];
            const expected = allGuias.length > 0 ? allGuias.length : (rec.received_units || 0);
            const processed = rec.subs && rec.subs.length ? rec.subs.filter(s => s.category).length : 0;
            unidades = `${processed}/${expected}`;
          }
          return { Fecha: fecha, 'No. Recepción TC': guia, Piloto: piloto, Recibió: recibido, Estatus: estatus, Unidades: unidades };
        });
    // Create worksheet and workbook using XLSX
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histórico');
    // Trigger download
    XLSX.writeFile(wb, `reporte_${moduleMode}.xlsx`);
  };

  const [pxDetailsData, setPxDetailsData] = React.useState<any>({ boxes: [], equipments: [], loading: false });
  const [filterDate, setFilterDate] = React.useState<string>('Todos');
  const [expandedLots, setExpandedLots] = React.useState<Record<string, boolean>>({});
  const [receptionGuides, setReceptionGuides] = React.useState<any[]>([]);

  const isDateMatch = (createdAt: string) => {
    if (filterDate === 'Todos' || !createdAt) return true;

    const d = new Date(createdAt);
    const now = new Date();

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Guatemala',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });

    const getGuateStr = (date: Date) => formatter.format(date);

    if (filterDate === 'Hoy') {
      return getGuateStr(d) === getGuateStr(now);
    }
    if (filterDate === 'Mes') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (filterDate === 'Semana') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo;
    }
    if (filterDate === 'Año') {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  };

  const pxRowKey = (rec: any, index: number) =>
    `px-${rec.id || 'noid'}-${rec.created_at || index}-${rec.sap_document || rec.guide_number || index}`;

  const filteredPxRecords = useMemo(() => {
    const seenIds = new Set<string>();
    return pxRecords.filter((rec: any) => {
      const searchLower = debouncedSearch.toLowerCase();
      const matchSearch =
        !debouncedSearch ||
        (rec.sap_document || '').toLowerCase().includes(searchLower) ||
        (rec.guide_number || '').toLowerCase().includes(searchLower) ||
        (rec.carrier || '').toLowerCase().includes(searchLower) ||
        (rec.received_by || 'SISTEMA').toLowerCase().includes(searchLower);
      const matchFilter = filterPilot === 'Todos' || rec.carrier === filterPilot;
      const matchDate = isDateMatch(rec.created_at);
      const notEliminated =
        rec.status !== 'ELIMINADO POR BODEGA' && rec.status !== 'ARCHIVADO';
      if (!matchSearch || !matchFilter || !matchDate || !notEliminated) return false;
      if (!rec.id) return true;
      if (seenIds.has(rec.id)) return false;
      seenIds.add(rec.id);
      return true;
    });
  }, [pxRecords, debouncedSearch, filterPilot, filterDate]);

  const duplicatePxSapDocuments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rec of filteredPxRecords) {
      const sap = String(rec.sap_document || '').trim();
      if (!sap || sap === '---' || sap === 'SIN-PEDIDO') continue;
      counts.set(sap, (counts.get(sap) || 0) + 1);
    }
    return new Set(
      [...counts.entries()].filter(([, n]) => n > 1).map(([sap]) => sap)
    );
  }, [filteredPxRecords]);

  const parsePxCajasCount = (rec: any) => {
    const fromNotes = rec.notes?.match(/Cajas:\s*(\d+)/i)?.[1];
    return fromNotes ? parseInt(fromNotes, 10) : 1;
  };

  const filteredCacRecords = useMemo(
    () =>
      cacRecords.filter((rec: any) => {
        const searchLower = debouncedSearch.toLowerCase();
        const matchSearch =
          !debouncedSearch ||
          rec.guide_number?.toLowerCase().includes(searchLower) ||
          rec.pilot_display?.toLowerCase().includes(searchLower) ||
          rec.notes?.toLowerCase().includes(searchLower);
        const matchFilter = filterPilot === 'Todos' || rec.pilot_display === filterPilot;
        const matchDate = isDateMatch(rec.created_at);
        const notEliminated =
          rec.status !== 'ELIMINADO' &&
          rec.status !== 'ELIMINADO POR BODEGA' &&
          rec.status !== 'ARCHIVADO';
        return matchSearch && matchFilter && matchDate && notEliminated;
      }),
    [cacRecords, debouncedSearch, filterPilot, filterDate]
  );

  const [cacHistoryPage, setCacHistoryPage] = React.useState(1);

  const cacHistoryGroups = useMemo(() => {
    const allGroups: Record<string, { master: any; subs: any[] }> = {};
    const masterRecords = cacRecords.filter((r: any) => !r.notes?.match(/como parte de lote (.*?)\./));

    masterRecords.forEach((record: any) => {
      const guides = receptionGuides.filter((g: any) => g.reception_id === record.id);

      if (guides.length === 0) {
        const rawNotes = record.notes || '';
        const cleanNotes = rawNotes.split('--- LÍNEA DE TIEMPO')[0].split('Backoffice_')[0].split('Guías Procesadas:')[0];
        const notesGuias =
          cleanNotes
            ?.split('Guías: ')[1]
            ?.split('\n')[0]
            ?.split(',')
            .map((g: string) => g.trim())
            .filter(Boolean) || [];
        const allGuias = notesGuias.length > 0 ? notesGuias : [record.guide_number];

        const subRecords = cacRecords.filter((r: any) => {
          const match = r.notes?.match(/como parte de lote (.*?)\./);
          return match && match[1].trim() === record.guide_number;
        });

        allGroups[record.id] = {
          master: { ...record, allGuias, isSub: false, isGuidesDb: false },
          subs: subRecords.map((s: any) => ({
            ...s,
            allGuias: [s.guide_number],
            isSub: true,
            isGuidesDb: false,
          })),
        };
      } else {
        const allGuias = guides.map((g: any) => g.guide_number);
        allGroups[record.id] = {
          master: { ...record, allGuias, isSub: false, isGuidesDb: true },
          subs: guides.map((g: any) => ({
            ...record,
            id: g.id,
            guide_number: g.guide_number,
            status: g.status,
            category: g.category,
            classified_by: g.classified_by,
            classified_at: g.classified_at,
            fecha_formateada: g.classified_at ? new Date(g.classified_at).toLocaleString() : '',
            isSub: true,
            isGuidesDb: true,
            allGuias: [g.guide_number],
          })),
        };
      }
    });

    const itemMatches = (item: any) => {
      if (!item) return false;
      const searchLower = debouncedSearch.toLowerCase();
      const matchesSearch =
        !debouncedSearch ||
        item.allGuias?.some((g: string) => g.toLowerCase().includes(searchLower)) ||
        item.guide_number?.toLowerCase().includes(searchLower) ||
        (item.pilot_display && item.pilot_display.toLowerCase().includes(searchLower));
      const matchesPilot = filterPilot === 'Todos' || item.pilot_display === filterPilot;
      const matchDate = isDateMatch(item.created_at);
      const notEliminated =
        item.status !== 'ELIMINADO' &&
        item.status !== 'ELIMINADO POR BODEGA' &&
        item.status !== 'ARCHIVADO';
      return matchesSearch && matchesPilot && matchDate && notEliminated;
    };

    const filteredGroups = Object.values(allGroups).filter((group) => {
      const masterMatches = itemMatches(group.master);
      const anySubMatches = group.subs.some(itemMatches);
      return masterMatches || anySubMatches;
    });

    const sortedGroups = filteredGroups.sort((a, b) => {
      const timeA = new Date(a.master ? a.master.created_at : a.subs[0]?.created_at || 0).getTime();
      const timeB = new Date(b.master ? b.master.created_at : b.subs[0]?.created_at || 0).getTime();
      return timeB - timeA;
    });

    return { sortedGroups, allGroups };
  }, [cacRecords, receptionGuides, debouncedSearch, filterPilot, filterDate]);

  React.useEffect(() => {
    if (moduleMode === 'cac') setCacHistoryPage(1);
  }, [debouncedSearch, filterPilot, filterDate, moduleMode]);

  const cacTotalGroups = cacHistoryGroups.sortedGroups.length;
  const cacTotalPages = Math.max(1, Math.ceil(cacTotalGroups / CAC_HISTORY_PAGE_SIZE));
  const cacSafePage = Math.min(cacHistoryPage, cacTotalPages);
  const cacStartItem = cacTotalGroups === 0 ? 0 : (cacSafePage - 1) * CAC_HISTORY_PAGE_SIZE + 1;
  const cacEndItem = Math.min(cacSafePage * CAC_HISTORY_PAGE_SIZE, cacTotalGroups);
  const cacPaginatedGroups = cacHistoryGroups.sortedGroups.slice(
    (cacSafePage - 1) * CAC_HISTORY_PAGE_SIZE,
    cacSafePage * CAC_HISTORY_PAGE_SIZE
  );
  const cacAllGroups = cacHistoryGroups.allGroups;

  React.useEffect(() => {
    const activeIds = new Set(cacRecords.map((r: any) => r.id));
    setReceptionGuides((prev) => prev.filter((g) => activeIds.has(g.reception_id)));
  }, [cacRecords]);

  React.useEffect(() => {
    if (moduleMode !== 'cac') return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const masterIds = cacPaginatedGroups.map((g) => g.master?.id).filter(Boolean);
    if (masterIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('reception_guides')
        .select('*')
        .in('reception_id', masterIds);
      if (cancelled || !data?.length) return;
      setReceptionGuides((prev) => {
        const map = new Map(prev.map((g) => [`${g.reception_id}:${g.guide_number}`, g]));
        for (const g of data) map.set(`${g.reception_id}:${g.guide_number}`, g);
        return Array.from(map.values());
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [cacPaginatedGroups, moduleMode]);

  const toggleLot = (loteId: string) => {
    setExpandedLots(prev => ({ ...prev, [loteId]: !prev[loteId] }));
  };

  const handleViewPxDetails = async (rec: any) => {
    setShowPxDetails(rec);
    setPxDetailsData({ boxes: [], equipments: [], loading: true });
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data: boxes } = await supabase
        .from('boxes')
        .select('*, brands(name), models(name, technologies(name))')
        .eq('reception_id', rec.id);
      const { data: series } = await supabase
        .from('series')
        .select('serial_number, service_order_id, current_box_id, material')
        .eq('current_reception_id', rec.id);
      const { data: serviceOrders } = await supabase
        .from('service_orders')
        .select('id, main_serial')
        .eq('reception_id', rec.id);

      const boxCodeById = Object.fromEntries((boxes || []).map((b: any) => [b.id, b.box_code]));
      const equipments = groupPxSeriesByEquipment(series || [], serviceOrders || [], boxCodeById);

      setPxDetailsData({ boxes: boxes || [], equipments, loading: false });
    } catch (error) {
      console.error(error);
      setPxDetailsData({ boxes: [], equipments: [], loading: false });
    }
  };

  // Columnas de la tabla PX (C3: DataTable virtualizado). Se definen dentro del
  // componente porque las celdas referencian handlers/estado del scope.
  const pxColumns = [
    {
      id: 'fecha',
      header: 'Fecha / Hora',
      width: '150px',
      cellClassName: 'truncate text-slate-600 font-bold',
      cell: (rec: any) => rec.fecha_formateada || new Date(rec.created_at).toLocaleString(),
    },
    {
      id: 'norec',
      header: 'No. REC',
      width: '95px',
      cellClassName: 'font-mono font-black text-[#2ec4f1] truncate',
      cell: (rec: any) => rec.guide_number || '---',
    },
    {
      id: 'sap',
      header: 'Documento SAP',
      width: '130px',
      cell: (rec: any) => {
        const sap = String(rec.sap_document || '').trim();
        const isDup = sap && duplicatePxSapDocuments.has(sap);
        return (
          <div className="min-w-0">
            <span className="font-mono font-black text-[#181c3a]">{rec.sap_document || '---'}</span>
            {isDup && (
              <span className="block text-[9px] font-black uppercase tracking-widest text-amber-600 mt-1">
                Pedido duplicado
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'agencia',
      header: 'Nombre Agencia PX',
      width: 'minmax(120px,1fr)',
      cellClassName: 'text-slate-500 font-bold truncate',
      cell: (rec: any) => rec.carrier || '---',
    },
    {
      id: 'usuario',
      header: 'Usuario',
      width: '120px',
      cellClassName: 'text-slate-500 font-bold truncate',
      cell: (rec: any) =>
        (rec.notes?.split('Recibido Por: ')?.[1]?.split('\n')?.[0]?.trim() || rec.received_by || 'SISTEMA').split('@')[0],
    },
    {
      id: 'cajas',
      header: 'Cant. Cajas',
      width: '95px',
      align: 'center' as const,
      cellClassName: 'font-black text-slate-800',
      cell: (rec: any) => `${parsePxCajasCount(rec)} Cajas`,
    },
    {
      id: 'equipos',
      header: 'Cantidad Equipos',
      width: '110px',
      align: 'center' as const,
      cellClassName: 'font-black text-slate-800',
      cell: (rec: any) => `${rec.received_units || 0} Equipos`,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      width: '140px',
      cell: (rec: any) => {
        const sap = String(rec.sap_document || '').trim();
        const isDup = sap && duplicatePxSapDocuments.has(sap);
        return (
          <Badge
            className={`border-none font-black text-[9px] ${rec.status === 'ELIMINADO POR BODEGA' ? 'bg-rose-50 text-rose-600' : isDup ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600'}`}
          >
            {rec.status === 'ELIMINADO POR BODEGA' ? 'ELIMINADO POR BODEGA' : isDup ? 'REVISAR DUPLICADO' : 'FINALIZADO'}
          </Badge>
        );
      },
    },
    {
      id: 'accion',
      header: 'Acción',
      width: '170px',
      align: 'right' as const,
      cell: (rec: any) => (
        <div className="flex items-center justify-end gap-3">
          <button
            className="text-slate-400 hover:text-indigo-500 transition-all hover:scale-110"
            title="Ver Detalle"
            onClick={(e) => {
              e.stopPropagation();
              handleViewPxDetails(rec);
            }}
          >
            <Eye size={18} strokeWidth={2} />
          </button>
          <button
            className="text-slate-400 hover:text-amber-500 transition-all hover:scale-110"
            title="Editar Documento SAP"
            onClick={async (e) => {
              e.stopPropagation();
              const newSap = await promptDialog({ title: 'Editar Documento SAP', prompt: { defaultValue: rec.sap_document || '' } });
              if (newSap === null || newSap.trim() === '' || newSap.trim() === rec.sap_document) return;
              try {
                const supabase = getSupabaseBrowserClient();
                if (!supabase) return;
                const { error } = await supabase.from('receptions').update({ sap_document: newSap.trim() }).eq('id', rec.id);
                if (error) throw error;
                setPxRecords((prev: any) => prev.map((r: any) => (r.id === rec.id ? { ...r, sap_document: newSap.trim() } : r)));
              } catch (err: any) {
                notify.error('Error al actualizar', { description: err.message });
              }
            }}
          >
            <Pencil size={18} strokeWidth={2} />
          </button>
          <button
            className="text-slate-400 hover:text-purple-500 transition-all hover:scale-110"
            title="Imprimir Etiquetas"
            onClick={(e) => {
              e.stopPropagation();
              handlePrintLabelsPX && handlePrintLabelsPX(rec);
            }}
          >
            <Tag size={18} strokeWidth={2} />
          </button>
          <button
            className="text-slate-400 hover:text-[#2ec4f1] transition-all hover:scale-110"
            title="Imprimir Conduce"
            onClick={(e) => {
              e.stopPropagation();
              handlePrintPX(rec);
            }}
          >
            <Printer size={18} strokeWidth={2} />
          </button>
          <button
            className="text-slate-400 hover:text-rose-500 transition-all hover:scale-110"
            title="Eliminar Recepción"
            onClick={async (e) => {
              e.stopPropagation();
              if (await confirmDialog({ title: 'Eliminar recepción', message: `¿Eliminar la recepción ${rec.guide_number || rec.sap_document}? (${rec.received_units || 0} equipos)`, tone: 'error', confirmText: 'Eliminar' })) {
                try {
                  if (handleDeleteHistoryPX) {
                    await handleDeleteHistoryPX(rec.id);
                    return;
                  }
                  const supabase = getSupabaseBrowserClient();
                  if (!supabase) return;
                  const { error } = await supabase.from('receptions').update({ status: 'ELIMINADO POR BODEGA' }).eq('id', rec.id);
                  if (error) throw error;
                  setPxRecords((prev: any) => prev.map((r: any) => (r.id === rec.id ? { ...r, status: 'ELIMINADO POR BODEGA' } : r)));
                } catch (err: any) {
                  notify.error('Error al eliminar', { description: err.message });
                }
              }
            }}
          >
            <Trash2 size={18} strokeWidth={2} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-rise-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-[#181c3a]">Historial de Recepciones ({moduleMode.toUpperCase()})</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Registros consolidados de auditoría</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex gap-2" onClick={handleExportReport}><Download size={14} /> Exportar Reporte</Button>
        </div>
      </div>      {/* PANEL DE MÉTRICAS HOY */}
      {(() => {
        const [kpis, setKpis] = React.useState({ guiasHoy: 0, equiposHoy: 0, enEspera: 0 });

        React.useEffect(() => {
          async function fetchKPIs() {
            const supabase = getSupabaseBrowserClient();
            if (!supabase) return;

            // 1. Calcular inicio y fin del día actual en Guatemala (UTC-6) -> a UTC para la DB
            const now = new Date();
            // Formateador en zona horaria America/Guatemala
            const formatter = new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/Guatemala',
              year: 'numeric', month: '2-digit', day: '2-digit'
            });
            const [{ value: mo }, , { value: da }, , { value: ye }] = formatter.formatToParts(now);
            
            // Creamos fechas representando las 00:00:00 y 23:59:59 en UTC-6
            // "YYYY-MM-DD T00:00:00 -06:00"
            const startOfDayGuatemalaStr = `${ye}-${mo}-${da}T00:00:00.000-06:00`;
            const endOfDayGuatemalaStr = `${ye}-${mo}-${da}T23:59:59.999-06:00`;

            const startOfDayUtc = new Date(startOfDayGuatemalaStr).toISOString();
            const endOfDayUtc = new Date(endOfDayGuatemalaStr).toISOString();

            try {
              // Consultar las 3 métricas
              const [
                { count: guiasHoyCount, error: err1 },
                { count: equiposHoyCount, error: err2 },
                { count: enEsperaCount, error: err3 }
              ] = await Promise.all([
                supabase.from('reception_guides')
                  .select('*', { count: 'exact', head: true })
                  .gte('created_at', startOfDayUtc)
                  .lte('created_at', endOfDayUtc),

                supabase.from('reception_guides')
                  .select('*', { count: 'exact', head: true })
                  .eq('category', 'equipo')
                  .gte('classified_at', startOfDayUtc)
                  .lte('classified_at', endOfDayUtc),

                supabase.from('reception_guides')
                  .select('*', { count: 'exact', head: true })
                  .is('category', null)
                  .gte('created_at', startOfDayUtc)
                  .lte('created_at', endOfDayUtc)
              ]);

              // Validamos que ninguna haya arrojado error
              if (!err1 && !err2 && !err3 && (guiasHoyCount! > 0 || equiposHoyCount! > 0 || enEsperaCount! > 0)) {
                setKpis({
                  guiasHoy: guiasHoyCount || 0,
                  equiposHoy: equiposHoyCount || 0,
                  enEspera: enEsperaCount || 0
                });
                return; // Si funcionó, salimos
              }
            } catch (err) {
              console.error("Error fetching KPIs from reception_guides:", err);
            }

            // --- FALLBACK: Lógica antigua con Regex ---
            const isSub = (r: any) => !!r.notes?.match(/como parte de lote (.*?)\./);
            const getGuiasCount = (r: any) => {
              if (isSub(r)) return 0;
              const rawNotes = r.notes || '';
              const cleanNotes = rawNotes.split('--- LÍNEA DE TIEMPO')[0].split('Backoffice_')[0].split('Guías Procesadas:')[0];
              const notesGuias = cleanNotes.split('Guías: ')[1]?.split('\n')[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
              return notesGuias.length > 0 ? notesGuias.length : 1;
            };
            const getEquiposCount = (r: any) => {
              if (isSub(r)) return r.received_units || 0;
              if (getGuiasCount(r) > 1) return 0; 
              return r.received_units || 0;
            };

            const guiasHoyFB = cacRecords
              .filter((r: any) => r.fecha_formateada?.includes(new Date().toLocaleDateString()))
              .reduce((acc: any, r: any) => acc + getGuiasCount(r), 0);

            const equiposHoyFB = cacRecords
              .filter((r: any) => r.fecha_formateada?.includes(new Date().toLocaleDateString()))
              .reduce((acc: any, r: any) => acc + getEquiposCount(r), 0);

            const pendingMasters = cacRecords.filter((r: any) => !isSub(r) && (r.status === 'RECEPCIONADA' || r.status === 'PENDIENTE DE CLASIFICAR'));
            let enEsperaFB = 0;
            pendingMasters.forEach((master: any) => {
              const expected = getGuiasCount(master);
              const uniqueProcessed = new Set(
                cacRecords.filter((sub: any) => isSub(sub) && sub.notes?.includes(master.guide_number))
                          .map((sub: any) => sub.guide_number)
              ).size;
              enEsperaFB += Math.max(0, expected - uniqueProcessed);
            });

            setKpis({
              guiasHoy: guiasHoyFB,
              equiposHoy: equiposHoyFB,
              enEspera: enEsperaFB
            });
          }

          fetchKPIs();
        }, [cacRecords]);

        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6 border-l-4 border-l-[#2ec4f1] bg-white shadow-sm">
              <div className="flex items-center gap-4">
                <div className="bg-blue-50 p-3 rounded-xl text-[#2ec4f1]"><ClipboardList size={20} /></div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Guías Hoy</p>
                  <h4 className="text-2xl font-black text-[#181c3a]">{kpis.guiasHoy}</h4>
                </div>
              </div>
            </Card>
            <Card className="p-6 border-l-4 border-l-emerald-500 bg-white shadow-sm">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-50 p-3 rounded-xl text-emerald-500"><Scan size={20} /></div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Equipos Hoy</p>
                  <h4 className="text-2xl font-black text-[#181c3a]">{kpis.equiposHoy}</h4>
                </div>
              </div>
            </Card>
            <Card className="p-6 border-l-4 border-l-amber-500 bg-white shadow-sm">
              <div className="flex items-center gap-4">
                <div className="bg-amber-50 p-3 rounded-xl text-amber-500"><Clock size={20} /></div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">En Espera (Backoffice)</p>
                  <h4 className="text-2xl font-black text-[#181c3a]">{kpis.enEspera}</h4>
                </div>
              </div>
            </Card>
          </div>
        );
      })()}
           {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#2ec4f1] transition-colors" />
          <input 
            type="text" 
            placeholder={moduleMode === 'cac' ? "Buscar por No. Guía o Piloto..." : "Buscar por SAP, Agencia o Usuario..."}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-[#2ec4f1] transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="relative">
          <Truck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select 
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black uppercase outline-none focus:border-[#2ec4f1] appearance-none"
            value={filterPilot}
            onChange={(e) => setFilterPilot(e.target.value)}
          >
            <option value="Todos">{moduleMode === 'cac' ? 'Todos los Pilotos' : 'Todas las Agencias'}</option>
            {Array.from(new Set(
              moduleMode === 'cac' 
                ? cacRecords.map((r: any) => r.notes?.split('Piloto: ')[1]?.split('\n')[0]).filter(Boolean)
                : pxRecords.map((r: any) => r.carrier).filter(Boolean)
            )).map((option: any) => (
              <option key={option as string} value={option as string}>{option as string}</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select 
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black uppercase outline-none focus:border-[#2ec4f1] appearance-none"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          >
            <option value="Todos">Todas las Fechas</option>
            <option value="Hoy">Hoy</option>
            <option value="Semana">La semana pasada</option>
            <option value="Mes">Este Mes</option>
            <option value="Año">El año completo</option>
          </select>
        </div>
      </div>

      {moduleMode === 'px' ? (
        <Card padding="none" className="border-none shadow-xl p-2">
          <DataTable
            columns={pxColumns}
            data={filteredPxRecords}
            getRowId={(rec: any, i: number) => pxRowKey(rec, i)}
            rowHeight={68}
            maxBodyHeight={640}
            minWidth={1010}
            headerClassName="bg-[#181c3a]"
            headerTextClassName="text-white/50"
            emptyMessage="No hay recepciones PX finalizadas"
            rowClassName={(rec: any) => {
              const sap = String(rec.sap_document || '').trim();
              return sap && duplicatePxSapDocuments.has(sap) ? 'bg-amber-50/60' : '';
            }}
          />
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden border-none shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#181c3a] text-white font-black uppercase tracking-[0.1em] text-[11px]">
                <tr>
                  <th className="px-6 py-5 whitespace-nowrap">Fecha / Hora</th>
                  <th className="px-6 py-5 whitespace-nowrap">No. Recepción TC</th>
                  <th className="px-6 py-5 whitespace-nowrap">Piloto</th>
                  <th className="px-6 py-5 whitespace-nowrap">Recibió</th>
                  <th className="px-6 py-5 whitespace-nowrap">Estatus</th>
                  <th className="px-6 py-5 whitespace-nowrap text-center">Unidades</th>
                  <th className="px-6 py-5 whitespace-nowrap text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  const renderItem = (item: any, isSubRow: boolean, masterItem: any, isExpanded: boolean = false, passedLoteId: string = '', hasSubs: boolean = false) => {
                    const loteId = passedLoteId || `LOTE-${(masterItem || item).id.split('-')[0].toUpperCase()}`;
                    const isMasterWithSubs = !isSubRow && hasSubs;
                    const rowClass = `hover:bg-blue-50/50 transition-colors border-b border-slate-100 group ${isSubRow ? "bg-slate-50/50" : ""} ${isMasterWithSubs ? "cursor-pointer" : ""}`;
                    const tdClass = "px-6 py-4 font-bold text-slate-800 text-xs whitespace-nowrap " + (isSubRow ? "pl-[4.5rem]" : "");
                    const spanClass = "font-mono font-black text-sm tracking-wide " + (isSubRow ? "text-slate-500" : "text-[#2ec4f1]");
                    
                    let badgeClass = "border-none font-black text-[9px] uppercase tracking-widest whitespace-nowrap ";
                    let badgeText = item.status || 'RECEPCIONADA';

                    if (isSubRow && item.isGuidesDb) {
                      if (!item.category) {
                        badgeClass += "bg-amber-100 text-amber-600";
                        badgeText = "PENDIENTE";
                      } else {
                        badgeText = item.category.toUpperCase();
                        if (item.category === 'equipo') badgeClass += "bg-blue-100 text-blue-600";
                        else if (item.category === 'accesorio') badgeClass += "bg-emerald-100 text-emerald-600";
                        else if (item.category === 'telefono') badgeClass += "bg-orange-100 text-orange-600";
                        else if (item.category === 'devolucion') badgeClass += "bg-rose-100 text-rose-600";
                        else badgeClass += "bg-slate-100 text-slate-500";
                      }
                    } else {
                      badgeClass += (isSubRow ? "bg-slate-100 text-slate-500" : "bg-blue-50 text-blue-600");
                      if (isSubRow && !item.isGuidesDb) badgeText = item.status || 'PROCESADO';
                    }

                    let receivedBy = 'SISTEMA';
                    if (isSubRow) {
                      if (item.isGuidesDb) {
                        receivedBy = item.classified_by || 'SISTEMA';
                      } else {
                        const porMatch = item.notes?.match(/Por:\s+([^$|\n]+)/);
                        if (porMatch) receivedBy = porMatch[1].trim();
                        else receivedBy = item.usuario || item.received_by || 'SISTEMA';
                      }
                    } else {
                      const reciboMatch = item.notes?.match(/Recibido Por:\s+([^\n]+)/);
                      if (reciboMatch) receivedBy = reciboMatch[1].trim();
                      else receivedBy = item.usuario || item.received_by || 'SISTEMA';
                    }
                    receivedBy = receivedBy.split('@')[0];

                    let unitsDisplay;
                    if (!isSubRow) {
                      const groupData = cacAllGroups[masterItem.id];
                      if (groupData && groupData.subs.length > 0) {
                        let processedGuidesCount = 0;
                        if (masterItem.isGuidesDb) {
                          processedGuidesCount = groupData.subs.filter((s: any) => s.category).length;
                        } else {
                          processedGuidesCount = groupData.subs.length;
                        }
                        
                        const expectedGuidesCount = item.allGuias.length > 0 ? item.allGuias.length : (item.received_units || 0);
                        const faltan = expectedGuidesCount - processedGuidesCount;
                        unitsDisplay = (
                          <div className="flex flex-col items-center justify-center">
                            <div className="flex items-center">
                              <span className="font-black text-[#181c3a]">{processedGuidesCount}</span>
                              <span className="text-slate-400 text-[10px] mx-1">/</span>
                              <span className="font-bold text-slate-500 text-[10px]">{expectedGuidesCount}</span>
                              <span className="text-slate-400 text-[10px] font-bold ml-1">guías</span>
                            </div>
                            {faltan > 0 && <div className="text-[9px] font-black text-rose-500 mt-0.5 tracking-widest uppercase">Faltan {faltan}</div>}
                            {faltan <= 0 && <div className="text-[9px] font-black text-emerald-500 mt-0.5 tracking-widest uppercase">Completo</div>}
                          </div>
                        );
                      } else {
                        const expectedGuidesCount = item.allGuias.length > 0 ? item.allGuias.length : (item.received_units || 0);
                        unitsDisplay = (
                          <div className="flex flex-col items-center justify-center">
                            <div className="flex items-center">
                              <span className="font-black text-[#181c3a]">0</span>
                              <span className="text-slate-400 text-[10px] mx-1">/</span>
                              <span className="font-bold text-slate-500 text-[10px]">{expectedGuidesCount}</span>
                              <span className="text-slate-400 text-[10px] font-bold ml-1">guías</span>
                            </div>
                            <div className="text-[9px] font-black text-rose-500 mt-0.5 tracking-widest uppercase">Faltan {expectedGuidesCount}</div>
                          </div>
                        );
                      }
                    } else {
                      unitsDisplay = <><span className="font-black text-slate-300">-</span></>;
                    }

                    return (
                      <tr
                        key={`cac-${isSubRow ? 'sub' : 'master'}-${item.id}-${item.guide_number || ''}-${masterItem?.id || ''}`}
                        className={rowClass}
                        onClick={isMasterWithSubs ? () => toggleLot(loteId) : undefined}
                      >
                        <td className={tdClass}>
                          <div className="flex items-center">
                            {isMasterWithSubs && (
                              <button className="mr-2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            )}
                            {isSubRow ? <div className="inline-block w-3 h-3 border-l-2 border-b-2 border-slate-300 rounded-bl mr-2 -translate-y-1"></div> : null}
                            {item.fecha_formateada}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {!isSubRow ? <div className="text-[9px] font-black uppercase text-slate-400 mb-0.5 tracking-widest">{loteId}</div> : null}
                          <div className="flex items-center gap-2 mb-1">
                            <span className={spanClass}>{item.guide_number}</span>
                          </div>
                          {item.allGuias.length > 0 && !isSubRow ? (
                            <div className="flex flex-wrap gap-1">
                              {item.allGuias.map((g: string, i: number) => (
                                <button 
                                  key={i} 
                                  onClick={(e) => { e.stopPropagation(); setShowTimeline(item); setTimelineActiveGuide(g); }}
                                  className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 hover:text-[#181c3a] px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                                  title={`Ver trazabilidad de la guía ${g}`}
                                >
                                  {g}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-6 py-4 font-black text-slate-800 text-xs uppercase">{!isSubRow ? item.pilot_display : <span className="text-slate-300">-</span>}</td>
                        <td className="px-6 py-4 font-black text-slate-700 text-xs uppercase">{!isSubRow ? receivedBy : <span className="text-slate-300">-</span>}</td>
                        <td className="px-6 py-4">
                          <Badge className={badgeClass}>
                            {badgeText}
                          </Badge>
                          {isSubRow && item.classified_by && (
                            <div className="mt-1 text-[9px] text-slate-400 font-bold leading-tight">
                              Por: {item.classified_by.split('@')[0]}
                              {item.classified_at && <br />}
                              {item.classified_at && new Date(item.classified_at).toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {unitsDisplay}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={(e) => { e.stopPropagation(); setShowTimeline(item); }} className="w-8 h-8 flex items-center justify-center bg-blue-50 text-[#2ec4f1] rounded-lg hover:bg-[#2ec4f1] hover:text-white transition-all shadow-sm"><Clock className="w-3.5 h-3.5" /></button>
                            {!isSubRow ? <button onClick={(e) => { e.stopPropagation(); handleEditHistoryCAC && handleEditHistoryCAC(item.id, item.guiaIdx); }} className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-[#181c3a] hover:text-white transition-all shadow-sm"><Pencil className="w-3.5 h-3.5" /></button> : null}
                            {!isSubRow ? <button onClick={(e) => { e.stopPropagation(); handlePrintCAC && handlePrintCAC(item); }} className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-[#181c3a] hover:text-white transition-all shadow-sm"><Printer className="w-3.5 h-3.5" /></button> : null}
                            {!isSubRow ? <button onClick={(e) => { e.stopPropagation(); handleDeleteHistoryCAC && handleDeleteHistoryCAC(item.id, item.guiaIdx); }} className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:bg-rose-500 hover:text-white transition-all shadow-sm"><Trash2 className="w-3.5 h-3.5" /></button> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  };

                  return cacPaginatedGroups.flatMap(group => {
                    const rows = [];
                    if (group.master) {
                      const loteId = `LOTE-${group.master.id.split('-')[0].toUpperCase()}`;
                      const isExpanded = !!expandedLots[loteId];
                      const hasSubs = group.subs && group.subs.length > 0;
                      rows.push(renderItem(group.master, false, group.master, isExpanded, loteId, hasSubs));
                      if (isExpanded) {
                        group.subs.forEach(sub => rows.push(renderItem(sub, true, group.master, false, loteId, false)));
                      }
                    }

                    return rows;
                  });
                })()}
                {cacTotalGroups === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-300 italic uppercase font-black tracking-widest">
                      No hay registros de CAC disponibles
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ReceptionCacHistoryPagination
            totalCount={cacTotalGroups}
            safePage={cacSafePage}
            totalPages={cacTotalPages}
            startItem={cacStartItem}
            endItem={cacEndItem}
            setHistoryPage={setCacHistoryPage}
          />
        </Card>
      )}

      {/* MODAL DETALLE PX */}
      {showPxDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-rise-in">
            <div className="bg-[#181c3a] p-5 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                  <Box className="w-5 h-5 text-[#2ec4f1]" />
                </div>
                <div>
                  <h3 className="font-black tracking-widest uppercase text-sm">Detalle de Recepción PX</h3>
                  <p className="text-[10px] text-white/50 mt-1 uppercase tracking-wider">
                    {showPxDetails.fecha_formateada || new Date(showPxDetails.created_at).toLocaleString()} • Por: {(showPxDetails.notes?.split('Recibido Por: ')?.[1]?.split('\n')?.[0]?.trim() || showPxDetails.received_by || 'SISTEMA').split('@')[0]}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowPxDetails(null)}
                className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-rose-500 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Doc SAP</p>
                  <p className="font-black text-[#181c3a]">{showPxDetails.sap_document || 'N/A'}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Proveedor</p>
                  <p className="font-black text-[#181c3a]">{showPxDetails.carrier || 'N/A'}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cajas</p>
                  <p className="font-black text-[#2ec4f1] text-lg">{pxDetailsData.boxes.length}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Equipos</p>
                  <p className="font-black text-emerald-500 text-lg">{pxDetailsData.equipments.length}</p>
                </div>
              </div>

              {pxDetailsData.loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <div className="w-8 h-8 border-4 border-[#2ec4f1] border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-xs font-bold uppercase tracking-widest">Cargando detalles...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {pxDetailsData.boxes.map((box: any) => {
                    const boxEquipments = pxDetailsData.equipments.filter(
                      (eq: any) => eq.current_box_id === box.id
                    );
                    return (
                      <Card key={box.id} className="p-0 overflow-hidden border border-slate-200 shadow-sm">
                        <div className="bg-white p-4 border-b border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <Badge variant="slate" className="font-black text-sm px-4 py-1.5">{box.box_code}</Badge>
                            <div className="flex flex-col">
                              <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest leading-tight">Marca & Modelo</span>
                              <span className="text-sm font-black text-[#181c3a]">{box.brands?.name || 'N/A'} <span className="text-slate-300 mx-1">|</span> {box.models?.name || 'N/A'}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Escaneados</p>
                              <p className="text-sm font-black text-emerald-500">{boxEquipments.length} / {box.capacity} und</p>
                            </div>
                            <button
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                const mappedBox = {
                                  ...box,
                                  boxCode: box.box_code,
                                  marca: box.brands?.name || 'N/A',
                                  modelo: box.models?.name || 'N/A',
                                  tecnologia: box.models?.technologies?.name || 'EQUIPO',
                                  totalEsperado: box.capacity || 0
                                };
                                printingService.printAllBoxLabels([mappedBox]); 
                              }}
                              className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-[#181c3a] text-slate-400 hover:text-white rounded-xl transition-all shadow-sm"
                              title="Imprimir Etiqueta Individual"
                            >
                              <Printer size={18} strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                        {boxEquipments.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 text-[10px] uppercase font-black text-slate-400">
                                <tr>
                                  <th className="px-4 py-2">Serie principal</th>
                                  <th className="px-4 py-2">Serie 2</th>
                                  <th className="px-4 py-2">Serie 3</th>
                                  <th className="px-4 py-2">Serie 4</th>
                                </tr>
                              </thead>
                              <tbody>
                                {boxEquipments.map((eq: any) => (
                                  <tr key={eq.service_order_id || eq.sn} className="border-t border-slate-100">
                                    <td className="px-4 py-2 font-mono font-bold text-[#181c3a]">{eq.sn}</td>
                                    <td className="px-4 py-2 font-mono text-slate-500">{eq.s2 || '-'}</td>
                                    <td className="px-4 py-2 font-mono text-slate-500">{eq.s3 || '-'}</td>
                                    <td className="px-4 py-2 font-mono text-slate-500">{eq.s4 || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3">
              <Button onClick={() => handlePrintLabelsPX(showPxDetails)} className="bg-[#2ec4f1] hover:bg-[#25a8d1] text-white text-[10px] uppercase font-black tracking-widest rounded-lg h-10 px-6">
                <Tag className="w-4 h-4 mr-2" /> Imprimir Etiquetas
              </Button>
              <Button onClick={() => setShowPxDetails(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] uppercase font-black tracking-widest rounded-lg h-10 px-6">
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {showTimeline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-rise-in">
            <div className="bg-[#181c3a] p-5 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                  <History className="w-5 h-5 text-[#2ec4f1]" />
                </div>
                <div>
                  <h3 className="font-black tracking-widest uppercase text-sm">
                    {timelineActiveGuide ? `Trazabilidad - Guía ${timelineActiveGuide}` : 'Trazabilidad de Recepción'}
                  </h3>
                  <p className="text-[10px] text-white/50 mt-1 uppercase tracking-wider">
                    Registro de movimientos TC: {showTimeline.guide_number}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setShowTimeline(null); setTimelineActiveGuide(null); }}
                className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-rose-500 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 bg-slate-50 overflow-y-auto custom-scrollbar flex-1">
              <div className="relative pl-6 space-y-6">
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-200" />
                
                <div className="relative flex items-start gap-4">
                  <div className="absolute -left-[30px] w-6 h-6 rounded-full border-4 border-slate-50 bg-[#2ec4f1] z-10" />
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex-1">
                    <p className="text-xs font-black uppercase tracking-widest text-[#181c3a]">Recepción Registrada</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">
                      {showTimeline.fecha_formateada || (showTimeline.created_at ? new Date(showTimeline.created_at).toLocaleString() : 'Fecha no disponible')}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Recibido por: {(showTimeline.notes?.split('Recibido Por: ')?.[1]?.split('\n')?.[0]?.trim() || showTimeline.usuario || showTimeline.received_by || 'SISTEMA').split('@')[0]}
                    </p>
                  </div>
                </div>

                {showTimeline.allGuias && showTimeline.allGuias.length > 0 && (
                  <div className="relative flex items-start gap-4">
                    <div className="absolute -left-[30px] w-6 h-6 rounded-full border-4 border-slate-50 bg-slate-300 z-10" />
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex-1">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Filtrar por Guía Específica</p>
                      <div className="flex flex-wrap gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setTimelineActiveGuide(null); }}
                          className={`border rounded-md px-3 py-1.5 flex items-center justify-center transition-all ${!timelineActiveGuide ? 'bg-slate-800 border-slate-800 text-white shadow-md scale-105' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-800'}`}
                          title="Ver todas las guías"
                        >
                          <span className="font-mono text-xs font-bold">TODAS</span>
                        </button>
                        {showTimeline.allGuias.map((g: string, i: number) => (
                          <button 
                            key={i} 
                            onClick={(e) => { e.stopPropagation(); setTimelineActiveGuide(g); }}
                            className={`border rounded-md px-3 py-1.5 flex items-center justify-center transition-all ${timelineActiveGuide === g ? 'bg-[#2ec4f1] border-[#2ec4f1] text-white shadow-md scale-105' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-[#2ec4f1]'}`}
                            title={`Ver detalle de movimientos para la guía ${g}`}
                          >
                            <span className="font-mono text-xs font-bold">{g}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Eventos Dinámicos de la Línea de Tiempo */}
                {(() => {
                  const notes = showTimeline.notes || '';
                  const lines = notes.split('\n');
                  const events = [];
                  let inTimeline = false;
                  for (const line of lines) {
                    if (line.includes('--- LÍNEA DE TIEMPO')) { inTimeline = true; continue; }
                    if (inTimeline && line.startsWith('---')) { inTimeline = false; }
                    if (inTimeline) {
                      const match = line.match(/^\[(.*?)\] (.*)$/);
                      if (match) {
                        const dateStr = match[1];
                        const content = match[2];
                        if (timelineActiveGuide) {
                          const guideMatch = content.match(/\(Guía (.*?)\)/);
                          if (guideMatch && guideMatch[1] !== timelineActiveGuide) continue;
                        }
                        // Skip initial reception event as it's hardcoded above
                        if (!content.includes('RECEPCIÓN: Ingreso inicial')) {
                           events.push({ date: dateStr, content: content });
                        }
                      }
                    }
                  }
                  
                  // Deduplicate identical events (sometimes appended twice in notes)
                  const uniqueEvents = Array.from(new Map(events.map(e => [e.date + e.content, e])).values());

                  return uniqueEvents.map((evt: any, i: number) => {
                    const isClasificacion = evt.content.includes('CLASIFICACIÓN');
                    const color = isClasificacion ? 'bg-purple-500' : 'bg-emerald-500';
                    return (
                      <div key={i} className="relative flex items-start gap-4">
                        <div className={`absolute -left-[30px] w-6 h-6 rounded-full border-4 border-slate-50 ${color} z-10`} />
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex-1">
                          <p className="text-[10px] font-bold text-slate-400 mb-1">{evt.date}</p>
                          <p className="text-xs font-bold text-[#181c3a]">{evt.content}</p>
                        </div>
                      </div>
                    );
                  });
                })()}

                <div className="relative flex items-start gap-4">
                  <div className={`absolute -left-[30px] w-6 h-6 rounded-full border-4 border-slate-50 ${showTimeline.status !== 'RECEPCIONADA' ? 'bg-[#2ec4f1]' : 'bg-slate-200'} z-10`} />
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex-1">
                    <p className={`text-xs font-black uppercase tracking-widest ${showTimeline.status !== 'RECEPCIONADA' ? 'text-[#181c3a]' : 'text-slate-400'}`}>Estado Final Actual</p>
                    <Badge className={`mt-2 ${showTimeline.status !== 'RECEPCIONADA' ? 'bg-[#2ec4f1] hover:bg-[#2ec4f1]' : 'bg-slate-200 text-slate-500 hover:bg-slate-200'}`}>
                      {showTimeline.status || 'RECEPCIONADA'}
                    </Badge>
                  </div>
                </div>

              </div>
            </div>
            
            <div className="p-4 bg-white border-t border-slate-100 flex justify-end shrink-0">
              <Button onClick={() => { setShowTimeline(null); setTimelineActiveGuide(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] uppercase font-black tracking-widest rounded-lg h-10 px-6">
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

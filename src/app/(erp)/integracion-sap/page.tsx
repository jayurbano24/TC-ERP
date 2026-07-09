'use client';

import React, { useState, useRef } from 'react';
import { 
  Database, UploadCloud, Activity, LayoutDashboard, History, Settings, FileSpreadsheet, 
  Search, ArrowRightLeft, FileWarning, CheckCircle2, AlertTriangle, Loader2
} from 'lucide-react';
import { Card, Button, Badge, DataTable, type DataTableColumn } from '@/components/ui';
import { apiFetch } from '@/lib/http/apiFetch';
import { useQuery } from '@tanstack/react-query';
import { parseSapUploadFile, type SapUploadRow } from '@/lib/sap/parseSapUploadFile';

// Referencia estable para la query mientras no hay datos.
const EMPTY_SAP_HISTORY: any[] = [];

// Columnas del historial de validaciones SAP (C3: tabla virtualizada).
const SAP_HISTORY_COLUMNS: DataTableColumn<any>[] = [
  { id: 'fecha', header: 'Fecha', cell: (h) => new Date(h.fecha).toLocaleString() },
  { id: 'archivo', header: 'Archivo', cell: (h) => h.archivo },
  { id: 'usuario', header: 'Usuario', cell: (h) => h.usuario },
  { id: 'registros', header: 'Filas Leídas', align: 'right', cell: (h) => h.registros },
  {
    id: 'encontrados',
    header: 'Validados',
    align: 'right',
    cellClassName: 'text-emerald-600',
    cell: (h) => h.encontrados,
  },
  {
    id: 'errores',
    header: 'Error / Inconsistencia',
    align: 'right',
    cellClassName: 'text-rose-500',
    cell: (h) => h.no_encontrados + h.inconsistencias,
  },
  {
    id: 'estado',
    header: 'Estado',
    align: 'center',
    cell: (h) => (
      <Badge className="bg-emerald-100 text-emerald-700 border-none uppercase text-[9px] font-black tracking-widest">
        {h.estado}
      </Badge>
    ),
  },
];

type UploadStatus = 'idle' | 'parsing' | 'hashing' | 'fetching' | 'matching' | 'syncing' | 'done' | 'error';

async function runSapMatchingPipeline(
  file: File,
  rows: SapUploadRow[],
  hash: string,
  format: string,
  logProcess: (msg: string) => void,
  setUploadStatus: (s: UploadStatus) => void,
  _setErrorMsg: (msg: string | null) => void
) {
  logProcess(`Estructura validada (${format.toUpperCase()}). Filas con serie: ${rows.length}`);

  setUploadStatus('matching');

  // Series únicas + material + valoración (Lote SAP)
  const serialSet = new Set<string>();
  const materials: Record<string, string> = {};
  const valuations: Record<string, string> = {};
  for (const row of rows) {
    const sn = String(row['Número de serie'] || '').trim();
    if (!sn || sn.length > 80) continue;
    serialSet.add(sn);
    const mat = String(row['Material'] || '').trim();
    if (mat && !materials[sn]) materials[sn] = mat.slice(0, 120);
    // En TC, series.valuation = Lote SAP (misma convención que despacho)
    const lote = String(row['Lote'] || row['Lote de stock'] || '').trim();
    if (lote && !valuations[sn]) valuations[sn] = lote.slice(0, 120);
  }
  const serials = Array.from(serialSet);
  if (serials.length === 0) {
    throw new Error('No se encontraron números de serie válidos en el archivo.');
  }

  logProcess(`Series únicas SAP: ${serials.length} (de ${rows.length} filas)`);
  logProcess('Cruce paulativo por lotes (solo coincidencias → bajo egress)...');

  const BATCH = 1500;
  type MatchRow = {
    id: string;
    serial_number: string;
    service_order_id: string;
    material: string | null;
    valuation: string | null;
  };
  const allMatches: MatchRow[] = [];
  let totalQueries = 0;
  let totalElapsed = 0;
  const totalBatches = Math.ceil(serials.length / BATCH);

  for (let i = 0; i < serials.length; i += BATCH) {
    const chunk = serials.slice(i, i + BATCH);
    const batchMaterials: Record<string, string> = {};
    const batchValuations: Record<string, string> = {};
    for (const sn of chunk) {
      if (materials[sn]) batchMaterials[sn] = materials[sn];
      if (valuations[sn]) batchValuations[sn] = valuations[sn];
    }
    const batchNo = Math.floor(i / BATCH) + 1;
    logProcess(`Lote ${batchNo}/${totalBatches}: ${chunk.length} series...`);

    const res = await apiFetch('/api/sap/match-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serials: chunk,
        materials: batchMaterials,
        valuations: batchValuations,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      const issueHint =
        Array.isArray(data.issues) && data.issues.length > 0
          ? ` (${data.issues
              .slice(0, 3)
              .map((x: { path?: string; message?: string }) => `${x.path || '?'}: ${x.message || ''}`)
              .join('; ')})`
          : '';
      throw new Error((data.error || 'Error en lote de cruce') + issueHint);
    }
    allMatches.push(...(data.matches || []));
    totalQueries += data.stats?.queries || 0;
    totalElapsed += data.stats?.elapsedMs || 0;
    logProcess(`  → ${data.stats?.matches || 0} coincidencias (queries: ${data.stats?.queries || 0})`);
  }

  // Agregar por equipo (solo matches)
  const seriesByEquipo = new Map<string, MatchRow[]>();
  const matchedById = new Map<string, MatchRow>();
  for (const m of allMatches) {
    matchedById.set(m.id, m);
    if (!seriesByEquipo.has(m.service_order_id)) seriesByEquipo.set(m.service_order_id, []);
    seriesByEquipo.get(m.service_order_id)!.push(m);
  }

  let validados = 0;
  let inconsistencias = 0;
  const matchedEquipos: { id: string; sap_integration_status: string }[] = [];
  const matchedSeries = Array.from(matchedById.values()).map((m) => ({
    id: m.id,
    material: m.material,
    valuation: m.valuation,
  }));
  const validationDetails: Record<string, unknown>[] = [];

  for (const [equipoId, eqMatches] of seriesByEquipo) {
    const materialsFound = new Set(
      eqMatches.map((m) => m.material).filter((x): x is string => Boolean(x))
    );
    let status = 'Validado SAP';
    if (materialsFound.size > 1) {
      status = 'Pendiente Revisión';
      inconsistencias++;
    } else {
      validados++;
    }
    matchedEquipos.push({ id: equipoId, sap_integration_status: status });

    // Detalle de auditoría solo de coincidencias (tope para no inflar el sync)
    if (validationDetails.length < 5_000) {
      eqMatches.forEach((m, idx) => {
        if (validationDetails.length >= 5_000) return;
        validationDetails.push({
          equipo_id: equipoId,
          tipo_serie: `S${idx + 1}`,
          serie: m.serial_number,
          material: m.material,
          lote: m.valuation,
          valoracion: m.valuation,
          coincidencia: true,
        });
      });
    }
  }

  // noEncontrados se calcula en BD al reset; aquí reportamos equipos con match
  logProcess(
    `Resumen: ${matchedSeries.length} series validadas · ${validados} equipos OK · ${inconsistencias} inconsistentes · queries=${totalQueries} · ${totalElapsed}ms`
  );
  if (matchedSeries.length > validationDetails.length) {
    logProcess(
      `Detalle auditoría: ${validationDetails.length} de ${matchedSeries.length} (tope 5k; estados se aplican a todas).`
    );
  }

  setUploadStatus('syncing');
  logProcess('Sincronizando (solo matches + reset set-based en BD)...');

  const syncRes = await apiFetch('/api/sap/sync-matches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileInfo: { name: file.name, hash, totalRows: rows.length, user: 'Usuario Activo' },
      results: {
        encontrados: validados,
        noEncontrados: 0,
        inconsistencias,
        timeStr: `${Math.max(1, Math.round(totalElapsed / 1000))} s`,
      },
      matchedSeries,
      matchedEquipos,
      validationDetails,
      resetUnmatched: true,
    }),
  });
  const syncData = await syncRes.json();
  if (!syncData.success) {
    throw new Error(syncData.error || 'Error al sincronizar');
  }

  if (syncData.mode === 'legacy') {
    logProcess('Aviso: sync legacy (aplica migración 098 en Supabase para reset set-based).');
  } else if (syncData.stats) {
    logProcess(
      `BD: ${syncData.stats.seriesMatched} series OK · ${syncData.stats.seriesUnmatched} sin match · ${syncData.stats.equiposMatched} equipos OK · ${syncData.stats.equiposUnmatched} sin match`
    );
  }
  logProcess(`Sincronización exitosa (${syncData.mode || 'ok'}).`);
  setUploadStatus('done');
}

export default function IntegracionSapPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cargar' | 'historial' | 'consulta' | 'diferencias' | 'config'>('dashboard');

  const [uploadStatus, setUploadStatus] = useState<'idle' | 'parsing' | 'hashing' | 'fetching' | 'matching' | 'syncing' | 'done' | 'error'>('idle');
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // C6: dashboard e historial SAP vía TanStack Query (cachea y deja de
  // re-consultar en cada cambio de pestaña dentro de la ventana de staleTime).
  const dashboardQuery = useQuery({
    queryKey: ['sap-dashboard'],
    queryFn: async () => {
      const res = await apiFetch('/api/sap/dashboard');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error al cargar dashboard SAP');
      return data;
    },
    enabled: activeTab === 'dashboard',
  });
  const dashboardData = dashboardQuery.data ?? null;
  const isLoadingDashboard = dashboardQuery.isLoading;

  const historyQuery = useQuery({
    queryKey: ['sap-history'],
    queryFn: async () => {
      const res = await apiFetch('/api/sap/history');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error al cargar historial SAP');
      return (data.data ?? []) as any[];
    },
    enabled: activeTab === 'historial',
  });
  const historyData = historyQuery.data ?? EMPTY_SAP_HISTORY;
  const isLoadingHistory = historyQuery.isLoading;

  const [queryInput, setQueryInput] = useState('');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;
    
    setIsQuerying(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const res = await apiFetch(`/api/sap/query?sn=${encodeURIComponent(queryInput.trim())}`);
      const data = await res.json();
      if (data.success) {
        setQueryResult(data.data);
      } else {
        setQueryError(data.error);
      }
    } catch (err: any) {
      setQueryError("Error de conexión al consultar serie");
    } finally {
      setIsQuerying(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const logProcess = (msg: string) => {
    setProgressLog(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus('parsing');
    setProgressLog([]);
    setErrorMsg(null);
    logProcess(`Archivo seleccionado: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    try {
      logProcess('Validando estructura y leyendo archivo...');
      const { rows, hash, format } = await parseSapUploadFile(file);
      logProcess(`Hash calculado: ${hash}`);

      await runSapMatchingPipeline(
        file,
        rows,
        hash,
        format,
        logProcess,
        setUploadStatus,
        setErrorMsg
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al procesar archivo';
      setErrorMsg(message);
      setUploadStatus('error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const renderDashboard = () => {
    if (isLoadingDashboard) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="w-12 h-12 text-[#2ec4f1] animate-spin" />
          <p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando métricas...</p>
        </div>
      );
    }

    const { kpis, lastUpload } = dashboardData || { kpis: {}, lastUpload: null };
    const equiposBase = kpis?.totalTC || 0;
    const seriesBase = kpis?.totalSeries || 0;
    const validadosPct = equiposBase ? Math.round((kpis.validados / equiposBase) * 100) : 0;
    const seriesValPct = seriesBase ? Math.round(((kpis?.seriesValidadas || 0) / seriesBase) * 100) : 0;
    const parcialPct = equiposBase ? Math.round(((kpis?.inconsistentes || 0) / equiposBase) * 100) : 0;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="p-5 border-none shadow-sm rounded-3xl bg-white flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Equipos TC (OS)</p>
                <h3 className="text-2xl font-black text-[#181c3a]">{(kpis?.totalTC ?? 0).toLocaleString()}</h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Database className="w-5 h-5 text-blue-500" />
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400">
              {(kpis?.totalSeries ?? 0).toLocaleString()} series ligadas · 1 OS = 1 equipo
            </p>
          </Card>

          <Card className="p-5 border-none shadow-sm rounded-3xl bg-white flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Equipos validados SAP</p>
                <h3 className="text-2xl font-black text-emerald-600">{(kpis?.validados ?? 0).toLocaleString()}</h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${validadosPct}%` }} />
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1">
              {(kpis?.seriesValidadas ?? 0).toLocaleString()} series OK ({seriesValPct}% series)
            </p>
          </Card>

          <Card className="p-5 border-none shadow-sm rounded-3xl bg-white flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Equipos pendientes</p>
                <h3 className="text-2xl font-black text-amber-500">{(kpis?.pendientes ?? 0).toLocaleString()}</h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center">
                <Activity className="w-5 h-5 text-amber-500" />
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400">Sin sync o sin serie ligada</p>
          </Card>

          <Card className="p-5 border-none shadow-sm rounded-3xl bg-white flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sin coincidencia</p>
                <h3 className="text-2xl font-black text-rose-500">{(kpis?.sinCoincidencia ?? 0).toLocaleString()}</h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400">
              {(kpis?.seriesSinMatch ?? 0).toLocaleString()} series ·{' '}
              {equiposBase ? Math.round((kpis.sinCoincidencia / equiposBase) * 100) : 0}% equipos
            </p>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 border-none shadow-sm rounded-3xl bg-white">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Última Sincronización</h3>
            {lastUpload ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="w-12 h-12 rounded-xl bg-[#181c3a] flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-black text-[#181c3a]">{lastUpload.archivo}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                      {new Date(lastUpload.fecha).toLocaleString()} • {lastUpload.usuario}
                    </p>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-700 border-none uppercase text-[9px] font-black tracking-widest px-3 py-1">
                    {lastUpload.estado}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 bg-white border border-slate-100 rounded-xl text-center">
                    <p className="text-xl font-black text-[#181c3a]">{lastUpload.registros > 1000 ? Math.round(lastUpload.registros/1000) + 'K' : lastUpload.registros}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Líneas Leídas</p>
                  </div>
                  <div className="p-3 bg-white border border-slate-100 rounded-xl text-center">
                    <p className="text-xl font-black text-[#181c3a]">{lastUpload.encontrados > 1000 ? Math.round(lastUpload.encontrados/1000) + 'K' : lastUpload.encontrados}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Match TC</p>
                  </div>
                  <div className="p-3 bg-white border border-slate-100 rounded-xl text-center">
                    <p className="text-xl font-black text-[#181c3a]">{lastUpload.tiempo_proceso || 'N/A'}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Tiempo</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-slate-400 text-sm font-bold text-center py-8">No hay cargas registradas.</p>
            )}
          </Card>

          <Card className="p-6 border-none shadow-sm rounded-3xl bg-white">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Calidad de Coincidencia (KPI)</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-[#181c3a]">Coincidencia Completa / SAP Validado</span>
                  <span className="text-emerald-500">{validadosPct}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${validadosPct}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-[#181c3a]">Material Diferente (Inconsistencia)</span>
                  <span className="text-amber-500">{parcialPct}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${parcialPct}%` }}></div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  const renderTabs = () => {
    const tabs = [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
      { id: 'cargar', label: 'Cargar Archivo', icon: <UploadCloud size={14} /> },
      { id: 'historial', label: 'Historial', icon: <History size={14} /> },
      { id: 'consulta', label: 'Consultar Serie', icon: <Search size={14} /> },
    ];

    return (
      <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-6 p-1 bg-slate-100 rounded-2xl w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id 
                ? 'bg-white text-[#2ec4f1] shadow-sm' 
                : 'text-slate-400 hover:text-[#181c3a] hover:bg-slate-200/50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    );
  };

  const renderHistory = () => {
    return (
      <Card className="p-6 border-none shadow-sm rounded-3xl bg-white">
        <h3 className="text-xl font-black text-[#181c3a] uppercase tracking-tight mb-6">Historial de Validaciones</h3>
        {isLoadingHistory ? (
          <div className="flex justify-center items-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#2ec4f1]" /></div>
        ) : (
          <DataTable
            columns={SAP_HISTORY_COLUMNS}
            data={historyData}
            getRowId={(h) => h.id}
            minWidth={760}
            maxBodyHeight={560}
            emptyMessage="No hay registros de cargas."
          />
        )}
      </Card>
    );
  };

  const renderQuery = () => {
    return (
      <Card className="p-6 border-none shadow-sm rounded-3xl bg-white min-h-[400px]">
        <h3 className="text-xl font-black text-[#181c3a] uppercase tracking-tight mb-6">Consulta Forense</h3>
        <form onSubmit={handleQuery} className="flex gap-4 mb-8">
          <input 
            type="text" 
            placeholder="Ingrese Número de Serie (SN, S1...)" 
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold uppercase"
          />
          <Button type="submit" disabled={isQuerying} className="bg-[#181c3a] hover:bg-[#181c3a]/90 text-white rounded-xl px-8 shadow-md">
            {isQuerying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          </Button>
        </form>

        {queryError && (
          <div className="bg-rose-50 text-rose-600 p-4 rounded-xl flex items-center gap-3 mb-6 font-bold text-sm">
            <AlertTriangle className="w-5 h-5" />
            {queryError}
          </div>
        )}

        {queryResult && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Información TC-Multimedia</h4>
                <div className="space-y-2 text-sm font-bold text-[#181c3a]">
                  <p>Serie: <span className="text-[#2ec4f1]">{queryResult.series.serial_number}</span></p>
                  <p>Orden (OS): {queryResult.series.service_orders?.os_label || 'S/OS'}</p>
                  <p>Estatus Actual: {queryResult.series.sap_status || 'N/A'}</p>
                  <p>Integración General (Equipo): {queryResult.series.service_orders?.sap_integration_status || 'N/A'}</p>
                </div>
              </div>
              
              <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl">
                <h4 className="text-[10px] font-black text-emerald-600/70 uppercase tracking-widest mb-4">Últimas Validaciones SAP</h4>
                {queryResult.validations && queryResult.validations.length > 0 ? (
                  <div className="space-y-3">
                    {queryResult.validations.map((v: any) => (
                      <div key={v.id} className="text-xs font-bold border-b border-emerald-100 pb-2">
                        <p className="text-emerald-700">{v.coincidencia ? 'MATCH' : 'SIN COINCIDENCIA'} - {v.tipo_serie}</p>
                        <p className="text-emerald-800/80">Material: {v.material || 'N/A'} - Lote: {v.lote || 'N/A'}</p>
                        <p className="text-[9px] uppercase tracking-widest text-emerald-600/50 mt-1">Sesión: {new Date(v.sap_validation_sessions?.fecha_fin).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-emerald-700">No hay validaciones registradas para este equipo.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto min-h-screen bg-[#fafafa]">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#181c3a] uppercase tracking-tight flex items-center gap-3">
            Centro de Integración SAP
            <Badge className="bg-[#2ec4f1]/10 text-[#2ec4f1] border-none px-3 py-1 text-[10px] tracking-widest">NÚCLEO</Badge>
          </h1>
          <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-1">
            Validación y Sincronización Maestra
          </p>
        </div>
      </div>

      {renderTabs()}

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'dashboard' && renderDashboard()}
        
        {activeTab === 'cargar' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="p-12 border-none shadow-sm rounded-3xl bg-white text-center flex flex-col items-center justify-center min-h-[500px]">
              {uploadStatus === 'idle' || uploadStatus === 'done' || uploadStatus === 'error' ? (
                <>
                  <UploadCloud className="w-16 h-16 text-slate-200 mb-4" />
                  <h3 className="text-xl font-black text-[#181c3a] uppercase tracking-tight mb-2">Cargar Archivo SAP</h3>
                  <p className="text-sm font-bold text-slate-400 max-w-sm mb-8">
                    Arrastra y suelta el archivo Excel (.xlsx) o CSV exportado de SAP. El sistema validará su estructura y ejecutará el motor en cascada.
                  </p>
                  
                  <input 
                    type="file" 
                    accept=".xlsx,.xls,.csv" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                  />
                  <Button 
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-[#2ec4f1] hover:bg-[#2ec4f1]/90 text-white rounded-xl font-black uppercase text-xs tracking-widest px-8 py-6 shadow-[0_0_20px_rgba(46,196,241,0.3)]"
                  >
                    Seleccionar Excel / CSV SAP
                  </Button>

                  {uploadStatus === 'done' && (
                    <div className="mt-8 flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-xs font-black uppercase tracking-widest">Sincronización Finalizada</span>
                    </div>
                  )}

                  {errorMsg && (
                    <div className="mt-8 flex items-center gap-2 text-rose-600 bg-rose-50 px-4 py-2 rounded-xl text-left">
                      <AlertTriangle className="w-5 h-5 shrink-0" />
                      <span className="text-xs font-bold">{errorMsg}</span>
                    </div>
                  )}

                  <div className="mt-12 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 max-w-md text-left">
                    <FileWarning className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1">Columnas Obligatorias</p>
                      <p className="text-[9px] font-bold text-amber-700/80 leading-relaxed">
                        Material, Texto breve de material, Número de serie, Centro, Almacén, Lote, Status del sistema, Lote de stock.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-[#2ec4f1]/20 rounded-full blur-xl animate-pulse"></div>
                    <div className="w-24 h-24 bg-white border border-slate-100 rounded-3xl shadow-xl flex items-center justify-center relative z-10">
                      <Loader2 className="w-10 h-10 text-[#2ec4f1] animate-spin" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-[#181c3a] uppercase tracking-tight">Procesando Validación</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                      {uploadStatus === 'parsing' && "Analizando Estructura y Filas..."}
                      {uploadStatus === 'hashing' && "Calculando Huella del Archivo..."}
                      {uploadStatus === 'fetching' && "Obteniendo Base de TC-Multimedia..."}
                      {uploadStatus === 'matching' && "Ejecutando Match en Cascada..."}
                      {uploadStatus === 'syncing' && "Escribiendo en Base de Datos..."}
                    </p>
                  </div>
                </div>
              )}
            </Card>

            {/* Bitacora / Audit Log live view */}
            <Card className="p-6 border-none shadow-sm rounded-3xl bg-[#181c3a] flex flex-col h-full overflow-hidden">
              <div className="flex items-center gap-2 mb-4 shrink-0 border-b border-white/10 pb-4">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <h3 className="text-xs font-black text-white uppercase tracking-widest">Bitácora de Procesamiento en Vivo</h3>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2 font-mono text-[10px]">
                {progressLog.length === 0 ? (
                  <div className="text-white/30 text-center mt-10">Esperando carga de archivo...</div>
                ) : (
                  progressLog.map((log, i) => (
                    <div key={i} className="text-white/80 animate-in fade-in slide-in-from-left-2">{log}</div>
                  ))
                )}
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'historial' && renderHistory()}
        {activeTab === 'consulta' && renderQuery()}
      </div>
    </div>
  );
}

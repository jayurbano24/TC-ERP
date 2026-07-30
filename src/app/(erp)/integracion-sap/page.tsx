'use client';

import React, { useState, useRef } from 'react';
import { 
  Database, UploadCloud, Activity, LayoutDashboard, History, Settings, FileSpreadsheet, 
  Search, ArrowRightLeft, FileWarning, CheckCircle2, AlertTriangle, Loader2
} from 'lucide-react';
import { Card, Button, Badge, DataTable, type DataTableColumn } from '@/components/ui';
import { erpTab, erpSoftStat, erpInputClass } from '@/lib/design/tokens';
import { apiFetch } from '@/lib/http/apiFetch';
import { useQuery } from '@tanstack/react-query';
import {
  parseSapUploadFile,
  extractSapMaterial,
  extractSapValuation,
  type SapUploadRow,
} from '@/lib/sap/parseSapUploadFile';

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
    cellClassName: 'text-[var(--success)]',
    cell: (h) => h.encontrados,
  },
  {
    id: 'errores',
    header: 'Error / Inconsistencia',
    align: 'right',
    cellClassName: 'text-[var(--danger)]',
    cell: (h) => h.no_encontrados + h.inconsistencias,
  },
  {
    id: 'estado',
    header: 'Estado',
    align: 'center',
    cell: (h) => (
      <Badge className="bg-[var(--success)]/15 text-[var(--success)] border-none uppercase text-[9px] font-black tracking-widest">
        {h.estado}
      </Badge>
    ),
  },
];

type UploadStatus = 'idle' | 'parsing' | 'hashing' | 'fetching' | 'matching' | 'syncing' | 'done' | 'error';

const yieldUi = () => new Promise<void>((r) => setTimeout(r, 0));

async function apiFetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await apiFetch(url, { ...init, signal: controller.signal });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      if (res.status === 429) {
        throw new Error('Demasiadas solicitudes. Espere 10–20 s y vuelva a cargar el archivo.');
      }
      if (res.status === 401) {
        throw new Error('Sesión expirada durante la carga. Vuelva a iniciar sesión e intente de nuevo.');
      }
      const issueHint =
        Array.isArray(data.issues) && data.issues.length > 0
          ? ` (${(data.issues as Array<{ path?: string; message?: string }>)
              .slice(0, 3)
              .map((x) => `${x.path || '?'}: ${x.message || ''}`)
              .join('; ')})`
          : '';
      throw new Error(String(data.error || `Error HTTP ${res.status}`) + issueHint);
    }
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `Tiempo de espera agotado (${Math.round(timeoutMs / 1000)}s). Reintente; si el Excel es muy grande, exporte a CSV o divídalo.`
      );
    }
    if (err instanceof Error && /abort/i.test(err.message)) {
      throw new Error(
        `Tiempo de espera agotado (${Math.round(timeoutMs / 1000)}s). Reintente; si el Excel es muy grande, exporte a CSV o divídalo.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

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
  await yieldUi();

  // Series únicas + material + valoración según layout real G985
  // Material = código; Valoración = Lote / Lote de stock (VALORADO|NOVALORAD)
  const serialSet = new Set<string>();
  const materials: Record<string, string> = {};
  const valuations: Record<string, string> = {};
  for (const row of rows) {
    const sn = String(row['Número de serie'] || '').trim();
    if (!sn || sn.length > 80) continue;
    serialSet.add(sn);
    const mat = extractSapMaterial(row);
    if (mat && !materials[sn]) materials[sn] = mat;
    const valoracion = extractSapValuation(row);
    if (valoracion && !valuations[sn]) valuations[sn] = valoracion;
  }
  const serials = Array.from(serialSet);
  if (serials.length === 0) {
    throw new Error('No se encontraron números de serie válidos en el archivo.');
  }

  logProcess(`Series únicas SAP: ${serials.length} (de ${rows.length} filas)`);
  if (serials.length > 40_000) {
    logProcess('Aviso: archivo muy grande (>40k series). El cruce puede tardar varios minutos.');
  }
  logProcess('Cruce por lotes (solo coincidencias → bajo egress)...');

  // Lotes más chicos: menos riesgo de timeout / body grande por request.
  const BATCH = 800;
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
    await yieldUi();

    let data: Record<string, unknown> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        data = await apiFetchJsonWithTimeout(
          '/api/sap/match-batch',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              serials: chunk,
              materials: batchMaterials,
              valuations: batchValuations,
            }),
          },
          120_000
        );
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          logProcess(`  ↻ Reintento lote ${batchNo} tras error transitorio...`);
          await new Promise((r) => setTimeout(r, 1_500));
        }
      }
    }
    if (lastErr || !data) throw lastErr instanceof Error ? lastErr : new Error('Error en lote de cruce');

    if (!data.success) {
      throw new Error(String(data.error || 'Error en lote de cruce'));
    }
    const matches = (data.matches || []) as MatchRow[];
    allMatches.push(...matches);
    const stats = (data.stats || {}) as { queries?: number; elapsedMs?: number; matches?: number };
    totalQueries += stats.queries || 0;
    totalElapsed += stats.elapsedMs || 0;
    logProcess(`  → ${stats.matches ?? matches.length} coincidencias (queries: ${stats.queries || 0})`);
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
  await yieldUi();

  const syncData = await apiFetchJsonWithTimeout(
    '/api/sap/sync-matches',
    {
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
    },
    240_000
  );

  if (!syncData.success) {
    throw new Error(String(syncData.error || 'Error al sincronizar'));
  }

  if (syncData.mode === 'legacy') {
    logProcess('Aviso: sync legacy (aplica migración 098 en Supabase para reset set-based).');
  } else if (syncData.stats && typeof syncData.stats === 'object') {
    const st = syncData.stats as Record<string, number>;
    logProcess(
      `BD: ${st.seriesMatched} series OK · ${st.seriesUnmatched} sin match · ${st.equiposMatched} equipos OK · ${st.equiposUnmatched} sin match`
    );
  }
  logProcess(`Sincronización exitosa (${String(syncData.mode || 'ok')}).`);
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
      const data = await apiFetchJsonWithTimeout('/api/sap/dashboard', {}, 45_000);
      if (!data.success) throw new Error(String(data.error || 'Error al cargar dashboard SAP'));
      return data;
    },
    enabled: activeTab === 'dashboard',
    retry: 1,
    staleTime: 60_000,
  });
  const dashboardData = dashboardQuery.data ?? null;
  const isLoadingDashboard = dashboardQuery.isLoading;

  const historyQuery = useQuery({
    queryKey: ['sap-history'],
    queryFn: async () => {
      const data = await apiFetchJsonWithTimeout('/api/sap/history?limit=100', {}, 45_000);
      if (!data.success) throw new Error(String(data.error || 'Error al cargar historial SAP'));
      return (data.data ?? []) as any[];
    },
    enabled: activeTab === 'historial',
    retry: 1,
    staleTime: 30_000,
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
    const sizeMb = file.size / 1024 / 1024;
    logProcess(`Archivo seleccionado: ${file.name} (${sizeMb.toFixed(2)} MB)`);
    if (sizeMb > 20) {
      logProcess('Aviso: archivo >20 MB. Preferible exportar CSV o dividir el Excel.');
    }

    try {
      logProcess('Validando estructura y leyendo archivo (puede tardar en Excel grandes)...');
      await yieldUi();
      const { rows, hash, format } = await parseSapUploadFile(file);
      logProcess(`Lectura OK · ${rows.length} filas con serie · hash ${hash.slice(0, 12)}…`);
      await yieldUi();

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
      logProcess(`ERROR: ${message}`);
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
          <Loader2 className="w-12 h-12 text-[var(--accent)] animate-spin" />
          <p className="mt-4 text-xs font-bold text-[var(--muted)] uppercase tracking-widest">Cargando métricas...</p>
        </div>
      );
    }

    if (dashboardQuery.isError) {
      return (
        <div className={`${erpSoftStat.danger} p-6 rounded-2xl flex items-start gap-3`}>
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-sm font-black uppercase tracking-widest mb-1">No se pudo cargar el dashboard</p>
            <p className="text-xs font-bold opacity-90">
              {dashboardQuery.error instanceof Error
                ? dashboardQuery.error.message
                : 'Error desconocido'}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => void dashboardQuery.refetch()}
            >
              Reintentar
            </Button>
          </div>
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
          <Card className="p-5 border border-[var(--border)] shadow-sm rounded-3xl bg-[var(--surface)] flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1">Equipos TC (OS)</p>
                <h3 className="text-2xl font-black text-[var(--heading)]">{(kpis?.totalTC ?? 0).toLocaleString()}</h3>
              </div>
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${erpSoftStat.accent}`}>
                <Database className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--muted)]">
              {(kpis?.totalSeries ?? 0).toLocaleString()} series ligadas · 1 OS = 1 equipo
            </p>
          </Card>

          <Card className="p-5 border border-[var(--border)] shadow-sm rounded-3xl bg-[var(--surface)] flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1">Equipos validados SAP</p>
                <h3 className="text-2xl font-black text-[var(--success)]">{(kpis?.validados ?? 0).toLocaleString()}</h3>
              </div>
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${erpSoftStat.success}`}>
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="w-full bg-[var(--surface-hover)] rounded-full h-1.5 mt-2">
              <div className="bg-[var(--success)] h-1.5 rounded-full" style={{ width: `${validadosPct}%` }} />
            </div>
            <p className="text-[10px] font-bold text-[var(--muted)] mt-1">
              {(kpis?.seriesValidadas ?? 0).toLocaleString()} series OK ({seriesValPct}% series)
            </p>
          </Card>

          <Card className="p-5 border border-[var(--border)] shadow-sm rounded-3xl bg-[var(--surface)] flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1">Equipos pendientes</p>
                <h3 className="text-2xl font-black text-[var(--warning)]">{(kpis?.pendientes ?? 0).toLocaleString()}</h3>
              </div>
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${erpSoftStat.warning}`}>
                <Activity className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--muted)]">Sin sync o sin serie ligada</p>
          </Card>

          <Card className="p-5 border border-[var(--border)] shadow-sm rounded-3xl bg-[var(--surface)] flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1">Sin coincidencia</p>
                <h3 className="text-2xl font-black text-[var(--danger)]">{(kpis?.sinCoincidencia ?? 0).toLocaleString()}</h3>
              </div>
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${erpSoftStat.danger}`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[10px] font-bold text-[var(--muted)]">
              {(kpis?.seriesSinMatch ?? 0).toLocaleString()} series ·{' '}
              {equiposBase ? Math.round((kpis.sinCoincidencia / equiposBase) * 100) : 0}% equipos
            </p>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 border border-[var(--border)] shadow-sm rounded-3xl bg-[var(--surface)]">
            <h3 className="text-xs font-black uppercase tracking-widest text-[var(--muted)] mb-6">Última Sincronización</h3>
            {lastUpload ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--surface-hover)] border border-[var(--border)]">
                  <div className="w-12 h-12 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-6 h-6 text-[var(--accent)]" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-black text-[var(--heading)]">{lastUpload.archivo}</h4>
                    <p className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest mt-1">
                      {new Date(lastUpload.fecha).toLocaleString()} • {lastUpload.usuario}
                    </p>
                  </div>
                  <Badge className="bg-[var(--success)]/15 text-[var(--success)] border-none uppercase text-[9px] font-black tracking-widest px-3 py-1">
                    {lastUpload.estado}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl text-center">
                    <p className="text-xl font-black text-[var(--heading)]">{lastUpload.registros > 1000 ? Math.round(lastUpload.registros/1000) + 'K' : lastUpload.registros}</p>
                    <p className="text-[8px] font-black text-[var(--muted)] uppercase tracking-widest mt-1">Líneas Leídas</p>
                  </div>
                  <div className="p-3 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl text-center">
                    <p className="text-xl font-black text-[var(--heading)]">{lastUpload.encontrados > 1000 ? Math.round(lastUpload.encontrados/1000) + 'K' : lastUpload.encontrados}</p>
                    <p className="text-[8px] font-black text-[var(--muted)] uppercase tracking-widest mt-1">Match TC</p>
                  </div>
                  <div className="p-3 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl text-center">
                    <p className="text-xl font-black text-[var(--heading)]">{lastUpload.tiempo_proceso || 'N/A'}</p>
                    <p className="text-[8px] font-black text-[var(--muted)] uppercase tracking-widest mt-1">Tiempo</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[var(--muted)] text-sm font-bold text-center py-8">No hay cargas registradas.</p>
            )}
          </Card>

          <Card className="p-6 border border-[var(--border)] shadow-sm rounded-3xl bg-[var(--surface)]">
            <h3 className="text-xs font-black uppercase tracking-widest text-[var(--muted)] mb-6">Calidad de Coincidencia (KPI)</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-[var(--heading)]">Coincidencia Completa / SAP Validado</span>
                  <span className="text-[var(--success)]">{validadosPct}%</span>
                </div>
                <div className="w-full bg-[var(--surface-hover)] rounded-full h-2">
                  <div className="bg-[var(--success)] h-2 rounded-full" style={{ width: `${validadosPct}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-[var(--heading)]">Material Diferente (Inconsistencia)</span>
                  <span className="text-[var(--warning)]">{parcialPct}%</span>
                </div>
                <div className="w-full bg-[var(--surface-hover)] rounded-full h-2">
                  <div className="bg-[var(--warning)] h-2 rounded-full" style={{ width: `${parcialPct}%` }}></div>
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
      <div className={`${erpTab.list} mb-6 w-fit max-w-full overflow-x-auto hide-scrollbar`} role="tablist">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 ${erpTab.trigger} ${active ? erpTab.triggerActive : erpTab.triggerInactive}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>
    );
  };

  const renderHistory = () => {
    return (
      <Card className="p-6 border border-[var(--border)] shadow-sm rounded-3xl bg-[var(--surface)]">
        <h3 className="text-xl font-black text-[var(--heading)] uppercase tracking-tight mb-6">Historial de Validaciones</h3>
        {isLoadingHistory ? (
          <div className="flex justify-center items-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" /></div>
        ) : historyQuery.isError ? (
          <div className={`${erpSoftStat.danger} p-4 rounded-xl flex items-start gap-3`}>
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-sm font-bold mb-2">
                {historyQuery.error instanceof Error
                  ? historyQuery.error.message
                  : 'No se pudo cargar el historial'}
              </p>
              <Button type="button" variant="outline" onClick={() => void historyQuery.refetch()}>
                Reintentar
              </Button>
            </div>
          </div>
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
      <Card className="p-6 border border-[var(--border)] shadow-sm rounded-3xl bg-[var(--surface)] min-h-[400px]">
        <h3 className="text-xl font-black text-[var(--heading)] uppercase tracking-tight mb-6">Consulta Forense</h3>
        <form onSubmit={handleQuery} className="flex gap-4 mb-8">
          <input 
            type="text" 
            placeholder="Ingrese Número de Serie (SN, S1...)" 
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            className={`flex-1 ${erpInputClass} uppercase`}
          />
          <Button type="submit" disabled={isQuerying} variant="primary" className="rounded-xl px-8 shadow-md">
            {isQuerying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          </Button>
        </form>

        {queryError && (
          <div className={`${erpSoftStat.danger} p-4 rounded-xl flex items-center gap-3 mb-6 font-bold text-sm`}>
            <AlertTriangle className="w-5 h-5" />
            {queryError}
          </div>
        )}

        {queryResult && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[var(--surface-hover)] border border-[var(--border)] p-5 rounded-2xl">
                <h4 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-4">Información TC-Multimedia</h4>
                <div className="space-y-2 text-sm font-bold text-[var(--heading)]">
                  <p>Serie: <span className="text-[var(--accent)]">{queryResult.series.serial_number}</span></p>
                  <p>Orden (OS): {queryResult.series.service_orders?.os_label || 'S/OS'}</p>
                  <p>Estatus Actual: {queryResult.series.sap_status || 'N/A'}</p>
                  <p>Integración General (Equipo): {queryResult.series.service_orders?.sap_integration_status || 'N/A'}</p>
                </div>
              </div>
              
              <div className={`${erpSoftStat.success} p-5 rounded-2xl`}>
                <h4 className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-80">Últimas Validaciones SAP</h4>
                {queryResult.validations && queryResult.validations.length > 0 ? (
                  <div className="space-y-3">
                    {queryResult.validations.map((v: any) => (
                      <div key={v.id} className="text-xs font-bold border-b border-[var(--success)]/20 pb-2">
                        <p>{v.coincidencia ? 'MATCH' : 'SIN COINCIDENCIA'} - {v.tipo_serie}</p>
                        <p className="opacity-80">Material: {v.material || 'N/A'} - Lote: {v.lote || 'N/A'}</p>
                        <p className="text-[9px] uppercase tracking-widest opacity-60 mt-1">Sesión: {new Date(v.sap_validation_sessions?.fecha_fin).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-bold">No hay validaciones registradas para este equipo.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto min-h-screen bg-[var(--background)]">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-[var(--heading)] uppercase tracking-tight flex items-center gap-3">
            Centro de Integración SAP
            <Badge className="bg-[var(--accent)]/15 text-[var(--accent)] border-none px-3 py-1 text-[10px] tracking-widest">NÚCLEO</Badge>
          </h1>
          <p className="text-[var(--muted)] text-sm font-bold uppercase tracking-widest mt-1">
            Validación y Sincronización Maestra
          </p>
        </div>
      </div>

      {renderTabs()}

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'dashboard' && renderDashboard()}
        
        {activeTab === 'cargar' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="p-12 border border-[var(--border)] shadow-sm rounded-3xl bg-[var(--surface)] text-center flex flex-col items-center justify-center min-h-[500px]">
              {uploadStatus === 'idle' || uploadStatus === 'done' || uploadStatus === 'error' ? (
                <>
                  <UploadCloud className="w-16 h-16 text-[var(--muted)]/40 mb-4" />
                  <h3 className="text-xl font-black text-[var(--heading)] uppercase tracking-tight mb-2">Cargar Archivo SAP</h3>
                  <p className="text-sm font-bold text-[var(--muted)] max-w-sm mb-8">
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
                    className="bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white rounded-xl font-black uppercase text-xs tracking-widest px-8 py-6 shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)]"
                  >
                    Seleccionar Excel / CSV SAP
                  </Button>

                  {uploadStatus === 'done' && (
                    <div className={`mt-8 flex items-center gap-2 px-4 py-2 rounded-xl ${erpSoftStat.success}`}>
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-xs font-black uppercase tracking-widest">Sincronización Finalizada</span>
                    </div>
                  )}

                  {errorMsg && (
                    <div className={`mt-8 flex items-center gap-2 px-4 py-2 rounded-xl text-left ${erpSoftStat.danger}`}>
                      <AlertTriangle className="w-5 h-5 shrink-0" />
                      <span className="text-xs font-bold">{errorMsg}</span>
                    </div>
                  )}

                  <div className={`mt-12 rounded-2xl p-4 flex items-start gap-3 max-w-md text-left ${erpSoftStat.warning}`}>
                    <FileWarning className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1">Columnas Obligatorias</p>
                      <p className="text-[9px] font-bold opacity-80 leading-relaxed">
                        Material, Texto breve de material, Número de serie, Centro, Almacén,
                        Lote (VALORADO/NOVALORAD), Status del sistema (ALMA), Lote de stock.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-[var(--accent)]/20 rounded-full blur-xl animate-pulse"></div>
                    <div className="w-24 h-24 bg-[var(--surface)] border border-[var(--border)] rounded-3xl shadow-xl flex items-center justify-center relative z-10">
                      <Loader2 className="w-10 h-10 text-[var(--accent)] animate-spin" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-[var(--heading)] uppercase tracking-tight">Procesando Validación</h3>
                    <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mt-1">
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
            <Card className="p-6 border border-[var(--border)] shadow-sm rounded-3xl bg-[var(--surface)] flex flex-col h-full overflow-hidden">
              <div className="flex items-center gap-2 mb-4 shrink-0 border-b border-[var(--border)] pb-4">
                <div className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse"></div>
                <h3 className="text-xs font-black text-[var(--heading)] uppercase tracking-widest">Bitácora de Procesamiento en Vivo</h3>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2 font-mono text-[10px]">
                {progressLog.length === 0 ? (
                  <div className="text-[var(--muted)] text-center mt-10">Esperando carga de archivo...</div>
                ) : (
                  progressLog.map((log, i) => (
                    <div key={i} className="text-[var(--foreground)] animate-in fade-in slide-in-from-left-2">{log}</div>
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

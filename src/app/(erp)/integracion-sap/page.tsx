'use client';

import React, { useState, useRef } from 'react';
import { 
  Database, UploadCloud, Activity, LayoutDashboard, History, Settings, FileSpreadsheet, 
  Search, ArrowRightLeft, FileWarning, CheckCircle2, AlertTriangle, Loader2
} from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import { parseSapUploadFile } from '@/lib/sap/parseSapUploadFile';

export default function IntegracionSAP() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cargar' | 'historial' | 'consulta' | 'diferencias' | 'config'>('dashboard');

  const [uploadStatus, setUploadStatus] = useState<'idle' | 'parsing' | 'hashing' | 'fetching' | 'matching' | 'syncing' | 'done' | 'error'>('idle');
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);

  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [queryInput, setQueryInput] = useState('');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  React.useEffect(() => {
    if (activeTab === 'dashboard') {
      setIsLoadingDashboard(true);
      fetch('/api/sap/dashboard')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setDashboardData(data);
          }
          setIsLoadingDashboard(false);
        })
        .catch(err => {
          console.error("Failed to fetch dashboard", err);
          setIsLoadingDashboard(false);
        });
    } else if (activeTab === 'historial') {
      setIsLoadingHistory(true);
      fetch('/api/sap/history')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setHistoryData(data.data);
          }
          setIsLoadingHistory(false);
        })
        .catch(err => {
          console.error("Failed to fetch history", err);
          setIsLoadingHistory(false);
        });
    }
  }, [activeTab]);

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;

    setIsQuerying(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const sn = encodeURIComponent(queryInput.trim());
      const [tcRes, sapRes] = await Promise.all([
        fetch(`/api/sap/query?sn=${sn}`),
        fetch(`/api/sap/stock-lookup?sn=${sn}`),
      ]);
      const tcData = await tcRes.json();
      const sapData = await sapRes.json();

      if (!sapData.success) {
        setQueryError(sapData.error);
        return;
      }

      setQueryResult({
        tc: tcData.success ? tcData.data : null,
        tcError: tcData.success ? null : tcData.error,
        sapStock: sapData.data,
      });
    } catch {
      setQueryError('Error de conexión al consultar serie');
    } finally {
      setIsQuerying(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const logProcess = (msg: string) => {
    setProgressLog(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
  };

  const runSapValidation = async (
    file: File,
    rows: Record<string, string>[],
    hash: string,
    formatLabel: string
  ) => {
    logProcess(`${formatLabel} leído. Total filas: ${rows.length}`);
    logProcess('Estructura validada correctamente.');

    setUploadStatus('syncing');
    logProcess('Importando series a Base SAP (consultable por número de serie)...');

    const importRes = await fetch('/api/sap/import-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows,
        fileInfo: { name: file.name, hash, totalRows: rows.length, user: 'Usuario Activo' },
      }),
    });
    const importData = await importRes.json();
    if (!importData.success) {
      throw new Error(importData.error || 'Error al indexar Base SAP');
    }

    logProcess(
      `Base SAP actualizada: ${importData.imported} series indexadas (${importData.skipped} filas sin SN).`
    );

    setUploadStatus('matching');
    logProcess('Validando equipos TC: consulta directa serie por serie en Base SAP...');

    const validateRes = await fetch('/api/sap/validate-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: importData.sessionId,
        uploadId: importData.uploadId,
      }),
    });
    const validateData = await validateRes.json();
    if (!validateData.success) {
      throw new Error(validateData.error || 'Error al validar equipos');
    }

    const { validados, noEncontrados, inconsistencias, processed } = validateData.data;
    logProcess(
      `Validación completada: ${validados} equipos Validado SAP, ${noEncontrados} sin coincidencia, ${inconsistencias} pendiente revisión (${processed} procesados).`
    );
    setUploadStatus('done');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus('hashing');
    setProgressLog([]);
    setErrorMsg(null);
    logProcess(`Archivo seleccionado: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    try {
      logProcess('Calculando Hash SHA-256 del archivo...');
      const parsed = await parseSapUploadFile(file);
      logProcess(`Hash calculado: ${parsed.hash}`);

      setUploadStatus('parsing');
      logProcess(
        parsed.format === 'xlsx'
          ? 'Validando estructura y leyendo Excel...'
          : 'Validando estructura y leyendo CSV...'
      );

      await runSapValidation(
        file,
        parsed.rows,
        parsed.hash,
        parsed.format === 'xlsx' ? 'Excel' : 'CSV'
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al procesar el archivo');
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
    const validadosPct = kpis?.totalTC ? Math.round((kpis.validados / kpis.totalTC) * 100) : 0;
    const parcialPct = kpis?.totalTC ? Math.round((kpis.inconsistentes / kpis.totalTC) * 100) : 0;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-5 border-none shadow-sm rounded-3xl bg-white flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Equipos en TC</p>
                <h3 className="text-2xl font-black text-[#181c3a]">{kpis?.totalTC?.toLocaleString() || 0}</h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Database className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </Card>
          
          <Card className="p-5 border-none shadow-sm rounded-3xl bg-white flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Validados SAP</p>
                <h3 className="text-2xl font-black text-emerald-600">{kpis?.validados?.toLocaleString() || 0}</h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${validadosPct}%` }}></div>
            </div>
          </Card>

          <Card className="p-5 border-none shadow-sm rounded-3xl bg-white flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pendientes</p>
                <h3 className="text-2xl font-black text-amber-500">{kpis?.pendientes?.toLocaleString() || 0}</h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center">
                <Activity className="w-5 h-5 text-amber-500" />
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400">Requieren carga de archivo</p>
          </Card>

          <Card className="p-5 border-none shadow-sm rounded-3xl bg-white flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sin Coincidencia</p>
                <h3 className="text-2xl font-black text-rose-500">{kpis?.sinCoincidencia?.toLocaleString() || 0}</h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400">{(kpis?.totalTC ? Math.round((kpis.sinCoincidencia / kpis.totalTC) * 100) : 0)}% de error</p>
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
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest text-slate-400 font-black">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Archivo</th>
                  <th className="p-3">Usuario</th>
                  <th className="p-3 text-right">Filas Leídas</th>
                  <th className="p-3 text-right">Validados</th>
                  <th className="p-3 text-right">Error / Inconsistencia</th>
                  <th className="p-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="text-xs font-bold text-[#181c3a]">
                {historyData.map(h => (
                  <tr key={h.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="p-3">{new Date(h.fecha).toLocaleString()}</td>
                    <td className="p-3">{h.archivo}</td>
                    <td className="p-3">{h.usuario}</td>
                    <td className="p-3 text-right">{h.registros}</td>
                    <td className="p-3 text-right text-emerald-600">{h.encontrados}</td>
                    <td className="p-3 text-right text-rose-500">{h.no_encontrados + h.inconsistencias}</td>
                    <td className="p-3 text-center">
                      <Badge className="bg-emerald-100 text-emerald-700 border-none uppercase text-[9px] font-black tracking-widest">
                        {h.estado}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {historyData.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">No hay registros de cargas.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
              <div className={`border p-5 rounded-2xl ${queryResult.sapStock?.exists_in_sap ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <h4 className="text-[10px] font-black uppercase tracking-widest mb-4 text-[#181c3a]">
                  Base SAP — consulta directa
                </h4>
                <div className="space-y-2 text-sm font-bold">
                  <p>Serie: <span className="text-[#2ec4f1]">{queryResult.sapStock?.serial}</span></p>
                  <p>
                    Resultado:{' '}
                    {queryResult.sapStock?.exists_in_sap ? (
                      <span className="text-emerald-700">✓ EXISTE en SAP</span>
                    ) : (
                      <span className="text-rose-700">✗ NO está en SAP</span>
                    )}
                  </p>
                  {queryResult.sapStock?.exists_in_sap && queryResult.sapStock.stock ? (
                    <>
                      <p>Material: {queryResult.sapStock.stock.material || 'N/A'}</p>
                      <p>Centro / Almacén: {queryResult.sapStock.stock.centro || '—'} / {queryResult.sapStock.stock.almacen || '—'}</p>
                      <p>Lote: {queryResult.sapStock.stock.lote || 'N/A'}</p>
                    </>
                  ) : null}
                  <p className="text-[10px] text-slate-500 font-bold">
                    Base indexada: {queryResult.sapStock?.sap_base_rows?.toLocaleString() || 0} series
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Inventario TC</h4>
                {queryResult.tc?.series ? (
                  <div className="space-y-2 text-sm font-bold text-[#181c3a]">
                    <p>Orden (OS): {queryResult.tc.series.service_orders?.os_label || 'S/OS'}</p>
                    <p>Estatus serie: {queryResult.tc.series.sap_status || 'N/A'}</p>
                    <p>Integración equipo: {queryResult.tc.series.service_orders?.sap_integration_status || 'N/A'}</p>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-slate-500">{queryResult.tcError || 'Serie no registrada en inventario TC.'}</p>
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
                    accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                  />
                  <Button 
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-[#2ec4f1] hover:bg-[#2ec4f1]/90 text-white rounded-xl font-black uppercase text-xs tracking-widest px-8 py-6 shadow-[0_0_20px_rgba(46,196,241,0.3)]"
                  >
                    Seleccionar Excel o CSV
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

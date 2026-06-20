import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Scan, Box, Pencil, Trash2, CheckCircle2, Plus, FileText, ArrowRight, ArrowLeft, Lock, LockOpen } from 'lucide-react';
import {
  canClosePxBox,
  getPxActiveBoxCodes,
  getPxBoxStats,
  validatePxFinalizeReadiness,
} from '../utils/pxBoxUtils';

export const PxReceptionTab = ({ 
  guideData, setGuideData, currentEntry, setCurrentEntry, systemPxProviders, 
  systemTechnologies, filteredBrands, filteredModels, handleAddCaja, manifestItems, 
  scannedSeries, setScannedSeries, selectedBoxForScan, setSelectedBoxForScan, printBoxLabel, 
  setManifestItems, handleFinalizePX, handleAddSN_PX, currentScans, setCurrentScans, 
  systemModels, moduleMode, isReceptionStarted, setIsReceptionStarted, isSubmittingPX,
  closedBoxes, setClosedBoxes, lastSavedAt
}: any) => {

  const [activeBoxNum, setActiveBoxNum] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'dashboard' | 'box_detail'>('dashboard');
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [headerDraft, setHeaderDraft] = useState<any>(null);
  const [headerFieldErrors, setHeaderFieldErrors] = useState<{ sap?: string; docReferencia?: string }>({});
  const [isCheckingHeader, setIsCheckingHeader] = useState(false);

  const workInProgress =
    manifestItems.length > 0 || scannedSeries.length > 0;

  const checkHeaderFields = async (sap: string, docReferencia: string, showAlert = false) => {
    setIsCheckingHeader(true);
    try {
      const { receptionRepository } = await import('../repositories/receptionRepository');
      const result = await receptionRepository.validatePxHeaderUniqueness(sap, docReferencia);
      if (!result.ok) {
        setHeaderFieldErrors({ [result.field]: result.message });
        if (showAlert) alert(result.message);
        return false;
      }
      setHeaderFieldErrors({});
      return true;
    } catch (e) {
      console.error(e);
      const message = 'No se pudo verificar duplicados. Verifique conexión e intente de nuevo.';
      if (showAlert) alert(message);
      return false;
    } finally {
      setIsCheckingHeader(false);
    }
  };

  const headerHasBlockingErrors =
    Boolean(headerFieldErrors.sap || headerFieldErrors.docReferencia);

  const renderHeaderFields = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Número de Pedido *</label>
        <input
          type="text"
          placeholder="Ej: 8000XXXX"
          className={`w-full h-12 bg-slate-50 border-2 rounded-xl px-4 text-sm font-bold outline-none transition-all ${
            headerFieldErrors.sap
              ? 'border-rose-400 bg-rose-50 focus:border-rose-500'
              : 'border-slate-100 focus:border-[#2ec4f1]'
          }`}
          value={guideData.sap}
          onChange={(e) => {
            setGuideData({ ...guideData, sap: e.target.value });
            if (headerFieldErrors.sap) {
              setHeaderFieldErrors((prev) => ({ ...prev, sap: undefined }));
            }
          }}
          onBlur={() => {
            if (guideData.sap?.trim() || guideData.docReferencia?.trim()) {
              void checkHeaderFields(guideData.sap, guideData.docReferencia);
            }
          }}
        />
        {headerFieldErrors.sap && (
          <p className="text-[11px] font-bold text-rose-600 leading-snug">{headerFieldErrors.sap}</p>
        )}
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">DOC Referencia</label>
        <input
          type="text"
          placeholder="Ej: REF-1234"
          className={`w-full h-12 bg-slate-50 border-2 rounded-xl px-4 text-sm font-bold outline-none transition-all ${
            headerFieldErrors.docReferencia
              ? 'border-rose-400 bg-rose-50 focus:border-rose-500'
              : 'border-slate-100 focus:border-[#2ec4f1]'
          }`}
          value={guideData.docReferencia}
          onChange={(e) => {
            setGuideData({ ...guideData, docReferencia: e.target.value });
            if (headerFieldErrors.docReferencia) {
              setHeaderFieldErrors((prev) => ({ ...prev, docReferencia: undefined }));
            }
          }}
          onBlur={() => {
            if (guideData.docReferencia?.trim() || guideData.sap?.trim()) {
              void checkHeaderFields(guideData.sap, guideData.docReferencia);
            }
          }}
        />
        {headerFieldErrors.docReferencia && (
          <p className="text-[11px] font-bold text-rose-600 leading-snug">{headerFieldErrors.docReferencia}</p>
        )}
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Proveedor PX *</label>
        <select
          className="w-full h-12 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all appearance-none"
          value={guideData.proveedorPx}
          onChange={(e) => setGuideData({ ...guideData, proveedorPx: e.target.value })}
        >
          <option value="">Seleccione...</option>
          {systemPxProviders.map((p: any) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Cantidad Total Cajas (Aprox)</label>
        <input
          type="number"
          min="1"
          className="w-full h-12 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all"
          value={guideData.totalCajasEsperadas || 1}
          onChange={(e) =>
            setGuideData({ ...guideData, totalCajasEsperadas: parseInt(e.target.value) || 1 })
          }
        />
      </div>
    </div>
  );

  const openHeaderEdit = () => {
    setHeaderDraft({ ...guideData });
    setHeaderFieldErrors({});
    setIsEditingHeader(true);
  };

  const saveHeaderEdit = async () => {
    if (!guideData.sap || !guideData.proveedorPx) {
      alert('Por favor complete al menos el Número de Pedido y Proveedor PX');
      return;
    }
    const isValid = await checkHeaderFields(guideData.sap, guideData.docReferencia, true);
    if (!isValid) return;
    setIsEditingHeader(false);
    setHeaderDraft(null);
  };

  const cancelHeaderEdit = () => {
    if (headerDraft) setGuideData(headerDraft);
    setIsEditingHeader(false);
    setHeaderDraft(null);
  };

  const handleAbandonReception = () => {
    if (
      workInProgress &&
      !window.confirm(
        '¿Abandonar esta recepción? Se perderán todas las cajas y series escaneadas.'
      )
    ) {
      return;
    }
    setManifestItems([]);
    setScannedSeries([]);
    setClosedBoxes([]);
    setSelectedBoxForScan(null);
    setGuideData({
      sap: '',
      docReferencia: '',
      agencia: guideData.agencia || 'Monte Verdes',
      proveedorPx: guideData.proveedorPx || '',
      guia: '',
      piloto: '',
      courier: '',
      totalCajasEsperadas: 1,
    });
    setIsReceptionStarted(false);
    setIsEditingHeader(false);
    setHeaderDraft(null);
    setViewMode('dashboard');
    try {
      localStorage.removeItem('tc_erp_px_reception_state');
    } catch {
      /* ignore */
    }
  };

  // Funciones locales para el nuevo flujo
  const handleStartReception = async () => {
    if (!guideData.sap || !guideData.proveedorPx) {
      alert("Por favor complete al menos el Número de Pedido y Proveedor PX");
      return;
    }
    const isValid = await checkHeaderFields(guideData.sap, guideData.docReferencia, true);
    if (!isValid) return;
    try {
      const { receptionRepository } = await import('../repositories/receptionRepository');
      let recNumber = guideData.guia?.trim();
      if (!recNumber) {
        recNumber = await receptionRepository.resolveUniquePxGuideNumber();
      } else {
        const available = await receptionRepository.isPxGuideNumberAvailable(recNumber);
        if (!available) {
          recNumber = await receptionRepository.resolveUniquePxGuideNumber();
        }
      }
      setGuideData({ ...guideData, guia: recNumber });
      setIsReceptionStarted(true);
      setViewMode('dashboard');
    } catch (e) {
      console.error(e);
      alert('No se pudo asignar número de recepción (REC). Verifique conexión e intente de nuevo.');
    }
  };

  const handleCreateNewBox = () => {
    // Busca el máximo número de caja actual
    let maxNum = 0;
    manifestItems.forEach((i: any) => {
      const match = i.boxCode.match(/CAJA-(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });
    
    // Si hay cajas vacías (lógicamente), se usan, de lo contrario se asume un nuevo CAJA-XXX basado en las que tengan items
    // Para simplificar, en este flujo las cajas "nacen" cuando se les agrega el primer lote, o podemos tener una lista separada.
    // Como manifestItems representa "Lotes", una caja sin lotes no existe en manifestItems.
    // Vamos a usar activeBoxNum para llevar el conteo.
    const nextNum = Math.max(maxNum, activeBoxNum) + 1;
    setActiveBoxNum(nextNum);
    const newBoxCode = `CAJA-${nextNum}`;
    
    // Entrar directamente a esa caja
    setSelectedBoxForScan(newBoxCode);
    setViewMode('box_detail');
  };

  const handleEnterBox = (boxCode: string) => {
    setSelectedBoxForScan(boxCode);
    setViewMode('box_detail');
  };

  const handleEditBox = (boxCode: string) => {
    handleEnterBox(boxCode);
  };

  const handleDeleteBox = (boxCode: string) => {
    if (closedBoxes.includes(boxCode)) {
      alert('No puede eliminar una caja cerrada. Reábrala primero si necesita modificarla.');
      return;
    }
    const lotsInBox = manifestItems.filter((i: any) => i.boxCode === boxCode).length;
    const seriesInBox = scannedSeries.filter((s: any) => s.boxCode === boxCode).length;
    const message =
      lotsInBox > 0 || seriesInBox > 0
        ? `¿Eliminar ${boxCode}? Se quitarán ${lotsInBox} lote(s) y ${seriesInBox} equipo(s) escaneado(s).`
        : `¿Eliminar la caja vacía ${boxCode}?`;
    if (!window.confirm(message)) return;

    setManifestItems(manifestItems.filter((i: any) => i.boxCode !== boxCode));
    setScannedSeries(scannedSeries.filter((s: any) => s.boxCode !== boxCode));
    setClosedBoxes(closedBoxes.filter((b: string) => b !== boxCode));
    if (selectedBoxForScan === boxCode) {
      setSelectedBoxForScan(null);
      setViewMode('dashboard');
    }
  };

  const handleBackToDashboard = () => {
    if (selectedBoxForScan) {
      const stats = getPxBoxStats(selectedBoxForScan, manifestItems, scannedSeries);
      if (stats.isEmpty) {
        setSelectedBoxForScan(null);
      }
    }
    setViewMode('dashboard');
  };

  const handleCloseBox = (boxCode: string) => {
    const check = canClosePxBox(boxCode, manifestItems, scannedSeries);
    if (!check.ok) {
      alert(check.reason);
      return;
    }
    if (
      !window.confirm(
        `¿Cerrar ${boxCode}?\n\nLos datos quedan guardados en este navegador. No podrá editar la caja hasta reabrirla.`
      )
    ) {
      return;
    }
    setClosedBoxes([...new Set([...closedBoxes, boxCode])]);
    setViewMode('dashboard');
    setSelectedBoxForScan(null);
  };

  const handleReopenBox = (boxCode: string) => {
    if (
      !window.confirm(
        `¿Reabrir ${boxCode}?\n\nPodrá volver a editar lotes y series. Debe cerrarla nuevamente antes de finalizar la recepción.`
      )
    ) {
      return;
    }
    setClosedBoxes(closedBoxes.filter((b: string) => b !== boxCode));
  };

  const handleAddLotToActiveBox = () => {
    const targetBoxCode = selectedBoxForScan || `CAJA-${activeBoxNum}`;
    if (closedBoxes.includes(targetBoxCode)) {
      alert('Esta caja está cerrada. Reábrala para agregar lotes.');
      return;
    }
    if (!currentEntry.tecnologia || !currentEntry.marca || !currentEntry.modelo || !currentEntry.totalEsperado) {
      alert("Por favor, complete tecnología, marca, modelo y cantidad esperada para este lote.");
      return;
    }

    setManifestItems([...manifestItems, {
      id: Math.random().toString(36).substr(2, 9),
      boxCode: targetBoxCode,
      ...currentEntry,
      material: ''
    }]);

    setSelectedBoxForScan(targetBoxCode);
    
    setCurrentEntry({
      ...currentEntry,
      totalEsperado: 0
    });
  };

  const boxesMap = new Map<string, any[]>();
  manifestItems.forEach((item: any) => {
    if (!boxesMap.has(item.boxCode)) {
      boxesMap.set(item.boxCode, []);
    }
    boxesMap.get(item.boxCode)!.push(item);
  });
  const activeBoxCodes = getPxActiveBoxCodes(manifestItems, scannedSeries);
  const finalizeCheck = validatePxFinalizeReadiness(manifestItems, scannedSeries, closedBoxes);
  const canFinalize = finalizeCheck.ok;
  const openBoxCount = activeBoxCodes.filter((b) => !closedBoxes.includes(b)).length;
  const closedBoxCount = activeBoxCodes.filter((b) => closedBoxes.includes(b)).length;

  // Si no ha iniciado, mostrar PASO 1
  if (!isReceptionStarted) {
    return (
      <div className="max-w-3xl mx-auto animate-rise-in mt-8">
        <Card className="border-l-4 border-l-[#2ec4f1] shadow-2xl">
          <div className="p-8 space-y-8">
            <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
              <div className="w-12 h-12 bg-[#2ec4f1]/10 rounded-full flex items-center justify-center">
                <FileText className="w-6 h-6 text-[#2ec4f1]" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[#181c3a] uppercase tracking-widest">Paso 1: Cabecera de Recepción</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Ingrese los datos del documento y proveedor</p>
              </div>
            </div>

            <div className="space-y-6">
              {workInProgress && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                  <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">
                    Recepción en progreso — se conservará al continuar
                  </p>
                  <p className="text-xs font-bold text-amber-800 mt-1">
                    {manifestItems.length} lote(s) en manifiesto · {scannedSeries.length} equipo(s) escaneado(s)
                    {guideData.guia ? ` · REC: ${guideData.guia}` : ''}
                  </p>
                </div>
              )}
              {renderHeaderFields()}
            </div>

            <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {workInProgress && (
                <button
                  type="button"
                  onClick={handleAbandonReception}
                  className="text-[10px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-600"
                >
                  Abandonar recepción y empezar de cero
                </button>
              )}
              <Button
                onClick={handleStartReception}
                disabled={isCheckingHeader || headerHasBlockingErrors}
                className="bg-[#181c3a] hover:bg-[#252b57] text-white h-14 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-[#181c3a]/20 rounded-2xl flex items-center gap-3 sm:ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCheckingHeader
                  ? 'Verificando...'
                  : workInProgress
                    ? 'Continuar recepción'
                    : 'Iniciar Recepción'}{' '}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ==========================================
  // PASO 2: VISTA DASHBOARD DE CAJAS
  // ==========================================
  if (viewMode === 'dashboard') {
    if (isEditingHeader) {
      return (
        <div className="max-w-3xl mx-auto animate-rise-in mt-4 space-y-6">
          <Card className="border-l-4 border-l-amber-400 shadow-2xl">
            <div className="p-8 space-y-6">
              <div>
                <h2 className="text-xl font-black text-[#181c3a] uppercase tracking-widest">Editar cabecera</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Las cajas y series escaneadas no se borran
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700">
                  Trabajo conservado
                </p>
                <p className="text-xs font-bold text-emerald-800 mt-1">
                  {manifestItems.length} lote(s) · {scannedSeries.length} equipo(s) escaneado(s)
                  {guideData.guia ? ` · REC: ${guideData.guia}` : ''}
                </p>
              </div>

              {renderHeaderFields()}

              <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={cancelHeaderEdit}
                  className="font-black text-[11px] uppercase tracking-widest"
                >
                  Volver sin cambios
                </Button>
                <Button
                  onClick={saveHeaderEdit}
                  disabled={isCheckingHeader || headerHasBlockingErrors}
                  className="bg-[#181c3a] hover:bg-[#252b57] text-white font-black text-[11px] uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCheckingHeader ? 'Verificando...' : 'Guardar cabecera'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return (
      <div className="space-y-8 animate-rise-in">
        
        {/* Cabecera Resumen & Botón Cancelar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#181c3a] uppercase tracking-widest">Recepción en Curso</h2>
              <div className="flex gap-4 mt-1 text-xs font-bold text-slate-400 uppercase">
                <span>Pedido: {guideData.sap || 'N/A'}</span>
                <span>•</span>
                <span>Proveedor: {guideData.proveedorPx || 'N/A'}</span>
                <span>•</span>
                <span>Fecha: {new Date().toLocaleDateString('es-ES')}</span>
                <span>•</span>
                <span>REC: {guideData.guia || 'Asignando...'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {lastSavedAt && (
              <span className="hidden lg:inline text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                Autoguardado {new Date(lastSavedAt).toLocaleTimeString('es-ES')} · {scannedSeries.length} series
              </span>
            )}
            <Button
              variant="outline"
              onClick={openHeaderEdit}
              className="border-none text-slate-500 hover:text-[#2ec4f1] hover:bg-[#2ec4f1]/10 font-black text-[11px] uppercase tracking-widest"
            >
              <Pencil className="w-4 h-4 mr-1" /> Editar cabecera
            </Button>
            <button
              type="button"
              onClick={handleAbandonReception}
              className="text-[10px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-600 px-2"
            >
              Abandonar
            </button>
            <Button 
              variant="primary" 
              onClick={() => {
                if (!canFinalize) {
                  alert(!finalizeCheck.ok ? finalizeCheck.reason : 'Complete y cierre todas las cajas antes de finalizar.');
                  return;
                }
                handleFinalizePX();
              }}
              disabled={!canFinalize || isSubmittingPX}
              title={!finalizeCheck.ok ? finalizeCheck.reason : 'Enviar cajas cerradas a Bodega Central'}
              className="bg-emerald-500 hover:bg-emerald-600 text-white h-12 px-6 font-black text-[11px] uppercase tracking-widest shadow-xl shadow-emerald-500/20 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" /> {isSubmittingPX ? 'Guardando...' : 'Finalizar Recepción'}
            </Button>
          </div>
        </div>

        {!canFinalize && activeBoxCodes.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-amber-800">
              Para finalizar: complete cada caja, ciérrela con &quot;Cerrar caja&quot;, y luego use Finalizar Recepción.
            </p>
            {!finalizeCheck.ok && (
              <p className="text-xs font-bold text-amber-700 mt-1">{finalizeCheck.reason}</p>
            )}
          </div>
        )}

        {/* Resumen Global */}
        <div className="flex flex-col md:flex-row gap-6">
          <Card className="p-6 border-l-4 border-l-[#2ec4f1] shadow-md w-full md:max-w-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Cajas en Proceso</h3>
              <Box className="w-5 h-5 text-[#2ec4f1]" />
            </div>
            <div>
              <span className="text-4xl font-black text-[#181c3a]">{activeBoxCodes.length}</span>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                {closedBoxCount} cerrada(s) · {openBoxCount} abierta(s)
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                De {guideData.totalCajasEsperadas} esperadas
              </p>
            </div>
          </Card>

          <div className="flex-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-[#181c3a] uppercase tracking-widest flex items-center gap-2">
                <Box className="w-6 h-6 text-[#2ec4f1]" />
                Cajas Activas
              </h2>
              <Button 
                onClick={handleCreateNewBox}
                className="bg-[#181c3a] hover:bg-[#252b57] text-white font-black text-[10px] uppercase tracking-widest h-10 px-6 transition-all shadow-lg hover:shadow-xl"
              >
                <Plus className="w-4 h-4 mr-2" /> Nueva Caja
              </Button>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 h-full overflow-y-auto max-h-[500px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {activeBoxCodes.length === 0 && (
                  <div className="col-span-full py-20 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
                    <Box className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Aún no hay cajas con equipos</h4>
                    <p className="text-[11px] text-slate-400 mt-2">Haz clic en Nueva Caja, agrega un lote y escanea series.</p>
                  </div>
                )}
            
            {activeBoxCodes.map((boxCode: string) => {
              const stats = getPxBoxStats(boxCode, manifestItems, scannedSeries);
              const boxItems = stats.lots;
              const { totalExpected, received, isComplete } = stats;
              const isClosed = closedBoxes.includes(boxCode);
              
              const uniqueModels = Array.from(new Set(boxItems.map((i: any) => `${i.marca} ${i.modelo}`)));

              return (
                <Card key={boxCode} className={`p-0 overflow-hidden shadow hover:shadow-md transition-all border-l-4 ${isClosed ? 'border-l-emerald-500' : isComplete ? 'border-l-[#181c3a]' : 'border-l-[#2ec4f1]'}`}>
                  <div className="p-3 flex justify-between items-start border-b border-slate-50">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-[#181c3a] leading-none">{boxCode}</h4>
                        {isClosed && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-none text-[8px] font-black uppercase px-1.5 py-0">
                            <Lock className="w-2.5 h-2.5 mr-0.5 inline" /> Cerrada
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5 space-y-0.5">
                        {uniqueModels.map((m: string, idx: number) => (
                          <p key={idx} className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{m}</p>
                        ))}
                      </div>
                    </div>
                    {!isClosed && (
                      <div className="flex gap-2">
                        <button onClick={() => handleEditBox(boxCode)} className="text-slate-300 hover:text-[#2ec4f1] transition-colors"><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => handleDeleteBox(boxCode)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    )}
                  </div>
                  <div className="bg-slate-50/50 p-3">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Items: {received} / {totalExpected}</span>
                      {isClosed ? <Lock className="w-3.5 h-3.5 text-emerald-500" /> : isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-[#181c3a]" />}
                    </div>
                    <Button 
                      onClick={() => handleEnterBox(boxCode)}
                      className={`w-full font-black text-[9px] uppercase tracking-widest h-8 transition-colors ${
                        isClosed
                          ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-500/20'
                          : isComplete 
                            ? 'bg-[#181c3a] hover:bg-[#252b57] text-white shadow-sm shadow-[#181c3a]/20'
                            : 'bg-[#2ec4f1] hover:bg-[#1fb3e0] text-white shadow-sm shadow-[#2ec4f1]/20'
                      }`}
                    >
                      {isClosed ? 'Ver caja cerrada' : isComplete ? 'Revisar y cerrar' : 'Continuar armado'} <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  </div>
);
  }

  // ==========================================
  // PASO 2: VISTA DETALLE DE CAJA (ARMADO)
  // ==========================================
  const targetBox = selectedBoxForScan || '';
  if (!targetBox) {
    return (
      <div className="space-y-6 animate-rise-in">
        <Button
          variant="outline"
          onClick={handleBackToDashboard}
          className="border-none text-slate-500 hover:text-[#181c3a] font-black text-[11px] uppercase tracking-widest"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Cajas Activas
        </Button>
        <p className="text-sm font-bold text-slate-400">Seleccione una caja para continuar.</p>
      </div>
    );
  }

  const boxItems = boxesMap.get(targetBox) || [];
  const boxStats = getPxBoxStats(targetBox, manifestItems, scannedSeries);
  const totalExpected = boxStats.totalExpected;
  const received = boxStats.received;
  const isBoxComplete = boxStats.isComplete;
  const isBoxClosed = closedBoxes.includes(targetBox);
  const progressPct = totalExpected > 0 ? Math.min(100, Math.round((received / totalExpected) * 100)) : 0;
  const canClose = canClosePxBox(targetBox, manifestItems, scannedSeries).ok;

  return (
    <div className="space-y-6 animate-rise-in">
      <div className="flex flex-wrap items-center gap-4 mb-2">
        <Button 
          variant="outline" 
          onClick={handleBackToDashboard}
          className="border-none text-slate-500 hover:text-[#181c3a] hover:bg-slate-100 font-black text-[11px] uppercase tracking-widest h-10 px-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Cajas Activas
        </Button>
        {lastSavedAt && (
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
            Autoguardado {new Date(lastSavedAt).toLocaleTimeString('es-ES')} · {scannedSeries.length} series totales
          </span>
        )}
        {isBoxClosed ? (
          <Button
            variant="outline"
            onClick={() => handleReopenBox(targetBox)}
            className="ml-auto border-amber-200 text-amber-700 hover:bg-amber-50 font-black text-[10px] uppercase tracking-widest h-10"
          >
            <LockOpen className="w-4 h-4 mr-2" /> Reabrir caja
          </Button>
        ) : canClose ? (
          <Button
            onClick={() => handleCloseBox(targetBox)}
            className="ml-auto bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest h-10 shadow-lg shadow-emerald-500/20"
          >
            <Lock className="w-4 h-4 mr-2" /> Cerrar caja
          </Button>
        ) : null}
      </div>

      {isBoxClosed && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-center gap-3">
          <Lock className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-800">Caja cerrada — solo lectura</p>
            <p className="text-xs font-bold text-emerald-700 mt-1">
              Los {received} equipos están guardados localmente. Reabra la caja solo si necesita corregir algo antes de finalizar la recepción.
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-8">
        
        {/* COLUMNA IZQUIERDA: CREACIÓN DE LOTES Y RESUMEN */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-6">
          <Card className="border-l-4 border-l-[#2ec4f1] shadow-xl p-0 overflow-hidden">
            <div className="bg-[#181c3a] p-5 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <Box className="w-5 h-5 text-[#2ec4f1]" />
                <h3 className="text-sm font-black uppercase tracking-widest">Caja Activa</h3>
              </div>
              <Badge className="bg-white/10 text-white border-none font-black">{targetBox}</Badge>
            </div>

            <div className="p-5 space-y-6 bg-slate-50">
              {!isBoxClosed && (
              <div className="space-y-4">
                <h4 className="text-[11px] font-black text-[#181c3a] uppercase tracking-widest border-b border-slate-200 pb-2">Agregar Lote a {targetBox}</h4>
                
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Tecnología</label>
                    <select 
                      className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[#2ec4f1] transition-colors"
                      value={currentEntry.tecnologia}
                      onChange={(e) => setCurrentEntry({...currentEntry, tecnologia: e.target.value, marca: '', modelo: ''})}
                    >
                      <option value="">Seleccione...</option>
                      {systemTechnologies.map((t: any) => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Marca</label>
                      <select
                        className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[#2ec4f1] transition-colors"
                        value={currentEntry.marca}
                        onChange={(e) => setCurrentEntry({...currentEntry, marca: e.target.value, modelo: ''})}
                      >
                        <option value="">Seleccione...</option>
                        {filteredBrands.map((b: any) => (
                          <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Modelo</label>
                      <select
                        className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[#2ec4f1] transition-colors"
                        value={currentEntry.modelo}
                        onChange={(e) => setCurrentEntry({...currentEntry, modelo: e.target.value})}
                      >
                        <option value="">Seleccione...</option>
                        {filteredModels.map((m: any) => (
                          <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Cant. Equipos</label>
                    <input 
                      type="number" 
                      min="1"
                      placeholder="Ej: 50"
                      className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[#2ec4f1] transition-colors"
                      value={currentEntry.totalEsperado || ''}
                      onChange={(e) => setCurrentEntry({...currentEntry, totalEsperado: parseInt(e.target.value) || 0})}
                    />
                  </div>

                  <Button 
                    onClick={handleAddLotToActiveBox}
                    className="w-full h-12 mt-2 bg-[#181c3a] hover:bg-[#252b57] text-white text-[11px] uppercase font-black tracking-widest rounded-lg shadow-lg shadow-[#181c3a]/20"
                  >
                    + Agregar Lote
                  </Button>
                </div>
              </div>
              )}

              {/* Lotes Agregados */}
              <div className="pt-4 border-t border-slate-200">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Lotes en la Caja</h4>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                  {boxItems.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic">No hay lotes configurados.</p>
                  ) : (
                    boxItems.map((item: any) => (
                      <div key={item.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm">
                        <div>
                          <p className="text-[11px] font-black text-[#181c3a]">{item.marca} {item.modelo}</p>
                          <p className="text-[9px] font-bold text-[#2ec4f1] uppercase">{item.tecnologia}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-slate-500">{item.totalEsperado} und</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </Card>
        </div>

        {/* COLUMNA DERECHA: ESCÁNER Y TABLA */}
        <div className="lg:col-span-8 xl:col-span-9 transition-all duration-300">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            
            {/* Escáner */}
            <div className="lg:col-span-4 xl:col-span-4 flex flex-col gap-6">
              <Card className="p-6 border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                <div className="mb-6 flex justify-between items-center">
                  <h3 className="text-[13px] font-black text-[#181c3a] uppercase tracking-widest">Escáner de Series</h3>
                </div>
                <form onSubmit={(e) => {
                  if (isBoxClosed) {
                    e.preventDefault();
                    alert('Esta caja está cerrada. Reábrala para escanear más equipos.');
                    return;
                  }
                  handleAddSN_PX(e);
                }} className="flex flex-col gap-5">
                  {(() => {
                    const lastItem = boxItems[boxItems.length - 1];
                    const expectedScans = lastItem ? (systemModels.find((m: any) => m.name === lastItem.modelo)?.series_count || (lastItem.tecnologia === 'EMTA' ? 4 : 1)) : 1;
                    
                    return (
                      <div className="flex flex-col gap-5">
                        {Array.from({ length: expectedScans }).map((_, idx) => {
                          const currentVal = currentScans[idx] || '';
                          const isDuplicate = currentVal.trim() !== '' && (
                            scannedSeries.some((s: any) => 
                              s.sn === currentVal.trim().toUpperCase() || 
                              s.s2 === currentVal.trim().toUpperCase() || 
                              s.s3 === currentVal.trim().toUpperCase() || 
                              s.s4 === currentVal.trim().toUpperCase()
                            ) ||
                            currentScans.some((v: string, i: number) => i !== idx && v.trim().toUpperCase() === currentVal.trim().toUpperCase())
                          );

                          return (
                            <div key={idx} className="space-y-2 relative">
                              <label className="text-[10px] font-black uppercase text-slate-400">Serie {idx + 1} *</label>
                              <input 
                                id={`scan-input-${idx}`}
                                type="text" 
                                value={currentVal}
                                onChange={(e) => {
                                  const newScans = [...currentScans];
                                  newScans[idx] = e.target.value;
                                  setCurrentScans(newScans);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (isDuplicate) {
                                      e.preventDefault();
                                      return;
                                    }
                                    if (idx < expectedScans - 1) {
                                      e.preventDefault();
                                      const nextInput = document.getElementById(`scan-input-${idx + 1}`);
                                      if (nextInput) nextInput.focus();
                                    }
                                  }
                                }}
                                placeholder={`Escanear Serie ${idx + 1}...`}
                                className={`w-full h-12 px-4 bg-white border-2 rounded-lg text-sm font-mono font-bold outline-none transition-colors shadow-inner uppercase ${isDuplicate ? 'border-rose-500 text-rose-600 focus:border-rose-500 bg-rose-50' : 'border-slate-200 focus:border-[#2ec4f1]'}`}
                                autoFocus={idx === 0 && !isBoxClosed}
                                disabled={boxItems.length === 0 || isBoxClosed}
                              />
                              {isDuplicate && (
                                <span className="text-[10px] text-rose-500 font-bold absolute -bottom-4 left-0">
                                  ⚠️ Esta serie ya fue escaneada
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <Button 
                    type="submit" 
                    disabled={boxItems.length === 0 || isBoxClosed}
                    className="w-full h-12 bg-[#181c3a] hover:bg-[#252b57] text-white text-[11px] uppercase tracking-widest font-black rounded-lg mt-2 shadow-lg shadow-[#181c3a]/20 disabled:opacity-50"
                  >
                    {isBoxClosed ? 'Caja cerrada' : 'Registrar Equipo (Enter)'}
                  </Button>
                </form>
              </Card>

              {/* Progreso */}
              <Card className="p-6 border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                <div className="mb-4">
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Progreso: {targetBox}</h3>
                </div>
                <div className="flex items-end gap-2 mb-4">
                  <span className="text-4xl font-black text-[#181c3a] leading-none">{received}</span>
                  <span className="text-sm font-bold text-slate-400 mb-1">/ {totalExpected} equipos</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-400 transition-all duration-500 ease-out" 
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </Card>
            </div>

            {/* Tabla Series */}
            <div className="lg:col-span-8 xl:col-span-8">
              <Card padding="none" className="overflow-hidden h-full border-2 border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col">
                <div className="bg-white border-b border-slate-100 p-5 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[11px] font-black text-[#181c3a] uppercase tracking-widest">Equipos Escaneados</h3>
                  </div>
                </div>
                <div className="overflow-x-auto flex-1 bg-white">
                  {(() => {
                    const showMulti = boxItems.some((item: any) => (systemModels.find((m: any) => m.name === item.modelo)?.series_count > 1 || item.tecnologia === 'EMTA'));
                    
                    return (
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead>
                          <tr className="bg-slate-50/80 border-b text-[10px] font-black uppercase text-slate-400">
                            <th className="px-6 py-4">S-1</th>
                            {showMulti && (
                              <>
                                <th className="px-6 py-4">S-2</th>
                                <th className="px-6 py-4">S-3</th>
                                <th className="px-6 py-4">S-4</th>
                              </>
                            )}
                            <th className="px-6 py-4 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {scannedSeries.filter((s: any) => s.boxCode === targetBox).length === 0 && (
                            <tr>
                              <td colSpan={showMulti ? 5 : 2} className="px-6 py-20 text-center">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <Scan className="w-8 h-8 text-slate-300" />
                                </div>
                                <h4 className="text-[12px] font-black text-[#181c3a] uppercase tracking-widest">La caja está vacía</h4>
                                <p className="text-[10px] font-bold text-slate-400 mt-2">
                                  {boxItems.length > 0 ? 'Agregue lotes y escanee equipos.' : 'Primero agregue un lote a la caja en el panel lateral.'}
                                </p>
                              </td>
                            </tr>
                          )}
                          {scannedSeries
                            .filter((s: any) => s.boxCode === targetBox)
                            .map((s: any, idx: number) => (
                            <tr key={`${s.sn}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 font-mono font-black text-[#181c3a]">
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  {s.sn}
                                </div>
                              </td>
                              {showMulti && (
                                <>
                                  <td className="px-6 py-4 font-mono text-slate-500">{s.s2 || '-'}</td>
                                  <td className="px-6 py-4 font-mono text-slate-500">{s.s3 || '-'}</td>
                                  <td className="px-6 py-4 font-mono text-slate-500">{s.s4 || '-'}</td>
                                </>
                              )}
                              <td className="px-6 py-4 text-right">
                                {!isBoxClosed && (
                                <div className="flex justify-end gap-1">
                                  <button 
                                    onClick={() => setScannedSeries(scannedSeries.filter((x: any) => x.sn !== s.sn))}
                                    className="p-1.5 hover:bg-rose-50 rounded-lg group transition-colors"
                                    title="Eliminar Equipo"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-slate-300 group-hover:text-rose-500" />
                                  </button>
                                </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </Card>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
};
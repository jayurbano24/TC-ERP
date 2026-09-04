import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FileText, ArrowRight, ArrowLeft } from 'lucide-react';
import { PxHeaderFields } from './px/PxHeaderFields';
import { PxBoxDetailView } from './px/PxBoxDetailView';
import { PxDashboardView } from './px/PxDashboardView';
import { usePxReception } from '../hooks/usePxReception';

export const PxReceptionTab = (props: any) => {
  const {
    guideData, setGuideData, systemPxProviders, manifestItems, scannedSeries,
    useIncrementalCapture, pxInProgressList, isLoadingIncrementalResume,
    onResumePxReception, isReceptionStarted, isSubmittingPX, finalizeProgress, lastSavedAt,
    incrementalReceptionId, boxMetaByCode, closedBoxes, handleFinalizePX,
    handleAddSN_PX, currentEntry, setCurrentEntry, currentScans, setCurrentScans,
    systemTechnologies, filteredBrands, filteredModels, systemModels,
  } = props;

  const {
    viewMode, isEditingHeader, headerFieldErrors, setHeaderFieldErrors,
    isCheckingHeader, workInProgress, headerHasBlockingErrors,
    boxScannedSeries, scannedSerialUpperSet, boxSeriesPagination,
    activeBoxCodes, boxLimitReached, finalizeCheck, canFinalize,
    openBoxCount, closedBoxCount, targetBox, boxItems, boxMeta,
    totalExpected, received, isBoxComplete, isBoxClosed, progressPct, hasBoxLock,
    boxEditDisabled, canClose,
    checkHeaderFields, openHeaderEdit, saveHeaderEdit, cancelHeaderEdit,
    handleAbandonReception, handleStartReception, handleCreateNewBox,
    handleEnterBox, handleEditBox, handleDeleteBox, handleDeleteEquipment,
    handleBackToDashboard, handleCloseBox, handleReopenBox,
    handleAddLotToActiveBox, handleAdjustQuantityClick,
  } = usePxReception(props);

  const renderHeaderFields = () => (
    <PxHeaderFields
      guideData={guideData}
      setGuideData={setGuideData}
      headerFieldErrors={headerFieldErrors}
      setHeaderFieldErrors={setHeaderFieldErrors}
      checkHeaderFields={checkHeaderFields}
      systemPxProviders={systemPxProviders}
    />
  );

  // Si no ha iniciado, mostrar PASO 1
  if (!isReceptionStarted) {
    return (
      <div className="max-w-3xl mx-auto animate-rise-in mt-8">
        <Card className="border-l-4 border-l-[var(--accent)] shadow-2xl">
          <div className="p-8 space-y-8">
            <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
              <div className="w-12 h-12 bg-[var(--accent)]/10 rounded-full flex items-center justify-center">
                <FileText className="w-6 h-6 text-[var(--accent)]" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[var(--heading)] uppercase tracking-widest">Paso 1: Cabecera de Recepción</h2>
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

              {useIncrementalCapture && (pxInProgressList?.length > 0 || isLoadingIncrementalResume) && (
                <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-5 py-4 space-y-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-[var(--heading)]">
                    Recepciones pendientes en servidor
                  </p>
                  {isLoadingIncrementalResume && (
                    <p className="text-xs font-bold text-slate-500">Recuperando sesión...</p>
                  )}
                  {(pxInProgressList || []).map((rec: any) => (
                    <div
                      key={rec.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white border border-slate-100 px-4 py-3"
                    >
                      <div>
                        <p className="text-xs font-black text-[var(--heading)]">{rec.guide_number}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          SAP {rec.sap_document || '—'} ·{' '}
                          {rec.status === 'FINALIZANDO'
                            ? `${rec.promoted_count} ingresados · ${rec.captured_count} pendientes`
                            : `${rec.captured_count} equipos capturados`}
                        </p>
                        {rec.status === 'FINALIZANDO' && (
                          <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
                            Finalización interrumpida — progreso guardado
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        onClick={() => onResumePxReception?.(rec.id)}
                        className="h-9 px-4 text-[9px] font-black uppercase tracking-widest bg-[var(--accent)] hover:bg-[#25aed4] text-white rounded-xl"
                      >
                        {rec.status === 'FINALIZANDO' ? 'Reanudar finalización' : 'Continuar'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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
                className="bg-[var(--heading)] hover:brightness-110 text-white h-14 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-[var(--heading)]/20 rounded-2xl flex items-center gap-3 sm:ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
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
                <h2 className="text-xl font-black text-[var(--heading)] uppercase tracking-widest">Editar cabecera</h2>
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
                  className="bg-[var(--heading)] hover:brightness-110 text-white font-black text-[11px] uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
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
      <PxDashboardView
        activeBoxCodes={activeBoxCodes}
        boxLimitReached={boxLimitReached}
        boxMetaByCode={boxMetaByCode}
        canFinalize={canFinalize}
        closedBoxCount={closedBoxCount}
        closedBoxes={closedBoxes}
        finalizeCheck={finalizeCheck}
        guideData={guideData}
        handleAbandonReception={handleAbandonReception}
        handleCreateNewBox={handleCreateNewBox}
        handleDeleteBox={handleDeleteBox}
        handleEditBox={handleEditBox}
        handleEnterBox={handleEnterBox}
        handleFinalizePX={handleFinalizePX}
        incrementalReceptionId={incrementalReceptionId}
        isSubmittingPX={isSubmittingPX}
        finalizeProgress={finalizeProgress}
        lastSavedAt={lastSavedAt}
        manifestItems={manifestItems}
        openBoxCount={openBoxCount}
        openHeaderEdit={openHeaderEdit}
        scannedSeries={scannedSeries}
        useIncrementalCapture={useIncrementalCapture}
      />
    );
  }

  // ==========================================
  // PASO 2: VISTA DETALLE DE CAJA (ARMADO)
  // ==========================================

  if (!targetBox) {
    return (
      <div className="space-y-6 animate-rise-in">
        <Button
          variant="outline"
          onClick={handleBackToDashboard}
          className="border-none text-slate-500 hover:text-[var(--heading)] font-black text-[11px] uppercase tracking-widest"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Cajas Activas
        </Button>
        <p className="text-sm font-bold text-slate-400">Seleccione una caja para continuar.</p>
      </div>
    );
  }

  return (
    <PxBoxDetailView
      boxEditDisabled={boxEditDisabled}
      boxItems={boxItems}
      boxMeta={boxMeta}
      boxScannedSeries={boxScannedSeries}
      boxSeriesPagination={boxSeriesPagination}
      canClose={canClose}
      currentEntry={currentEntry}
      currentScans={currentScans}
      filteredBrands={filteredBrands}
      filteredModels={filteredModels}
      handleAddLotToActiveBox={handleAddLotToActiveBox}
      handleAddSN_PX={handleAddSN_PX}
      handleAdjustQuantityClick={handleAdjustQuantityClick}
      handleBackToDashboard={handleBackToDashboard}
      handleCloseBox={handleCloseBox}
      handleDeleteEquipment={handleDeleteEquipment}
      handleReopenBox={handleReopenBox}
      hasBoxLock={hasBoxLock}
      incrementalReceptionId={incrementalReceptionId}
      isBoxComplete={isBoxComplete}
      isBoxClosed={isBoxClosed}
      lastSavedAt={lastSavedAt}
      progressPct={progressPct}
      received={received}
      scannedSerialUpperSet={scannedSerialUpperSet}
      scannedSeries={scannedSeries}
      setCurrentEntry={setCurrentEntry}
      setCurrentScans={setCurrentScans}
      systemModels={systemModels}
      systemTechnologies={systemTechnologies}
      targetBox={targetBox}
      totalExpected={totalExpected}
      useIncrementalCapture={useIncrementalCapture}
    />
  );
};

// @ts-nocheck
import React from 'react';
import { Card } from '@/components/ui/Card';
import { TablePagination } from '@/components/ui/TablePagination';
import BarcodeScanner from '@/components/BarcodeScanner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { notify, confirmDialog, promptDialog } from '@/components/ui';
import { Scan, FileText, Upload, Camera, AlertCircle, Truck, Barcode, QrCode, Pencil, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { useClientPagination } from '@/hooks/useClientPagination';

const CAC_SCAN_PAGE_SIZE = 20;

export const CacReceptionTab = ({ 
  cacAgency, setCacAgency, cacPilot, setCacPilot, cacCarrier, setCacCarrier, 
  transportes = [], cacTotalCajas, setCacTotalCajas, isIndustrialScanning, 
  setIsIndustrialScanning, scanInputRef, cacScannedItems, setCacScannedItems, 
  cacScanInput, setCacScanInput, setCacError, setIsCameraScannerOpen, 
  isCameraScannerOpen, cacError, 
  handleFinalizeCAC, loading 
}: any) => {

  const cacScanPagination = useClientPagination(cacScannedItems, CAC_SCAN_PAGE_SIZE, [
    cacScannedItems.length,
  ]);

  const handleScan_CAC = (e: React.FormEvent) => {
    e.preventDefault();
    const val = cacScanInput.trim().toUpperCase();
    if (!val) return;
    
    if (cacScannedItems.includes(val)) {
      setCacError(`La serie ${val} ya fue escaneada.`);
      return;
    }
    
    if (cacScannedItems.length >= cacTotalCajas) {
      setCacError(`Ya se alcanzó el total de ${cacTotalCajas} bultos.`);
      return;
    }

    setCacScannedItems((prev: any) => [val, ...prev]);
    setCacScanInput('');
    setCacError('');
    scanInputRef.current?.focus();
  };

  const handleEditCACSeries = async (index: number) => {
    const newVal = await promptDialog({
      title: 'Editar serie',
      prompt: { defaultValue: cacScannedItems[index] },
    });
    if (newVal && newVal.trim()) {
      const updated = [...cacScannedItems];
      updated[index] = newVal.trim().toUpperCase();
      setCacScannedItems(updated);
    }
  };

  const handleDeleteCACSeries = async (index: number) => {
    const ok = await confirmDialog({ title: 'Eliminar serie', message: '¿Eliminar esta serie?', tone: 'error', confirmText: 'Eliminar' });
    if (ok) {
      const updated = [...cacScannedItems];
      updated.splice(index, 1);
      setCacScannedItems(updated);
    }
  };

  return (
    <>
        <div className="space-y-6 animate-rise-in">
          <Card className="p-0 overflow-hidden border-2 border-[#2ec4f1]/20 shadow-2xl rounded-3xl bg-white">
            <div className="bg-[#181c3a] p-8 text-white flex justify-between items-center border-b-4 border-[#2ec4f1]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#2ec4f1]/20 flex items-center justify-center text-[#2ec4f1]">
                  <Truck size={24} />
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tight">Nueva Recepción de Carga (CAC)</h2>
              </div>
            </div>
            <div className="p-10 space-y-12">
              <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="w-8 h-8 rounded-full bg-[#181c3a] text-white flex items-center justify-center font-black text-xs">1</div>
                  <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-widest">Paso 1: Encabezado de Recepción (Formulario)</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                  <div className="md:col-span-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 ml-1">Transportista / Piloto</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nombre Piloto"
                        value={cacPilot}
                        onChange={e => setCacPilot(e.target.value)}
                        className={`flex-1 h-14 px-6 bg-slate-50 border-2 rounded-2xl font-bold text-sm text-[#181c3a] outline-none transition-all shadow-sm ${!cacPilot ? 'border-rose-300 bg-rose-50/20' : 'border-slate-100 focus:border-[#2ec4f1] focus:bg-white'}`}
                      />
                    </div>
                    {!cacPilot && <p className="text-[8px] font-black text-rose-500 uppercase mt-2 ml-1">Campo Requerido</p>}
                  </div>

                  <div className="md:col-span-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 ml-1">Empresa Logística</label>
                    <div className="flex gap-2">
                      <select
                        value={cacCarrier}
                        onChange={e => setCacCarrier(e.target.value)}
                        className={`flex-1 h-14 px-6 bg-slate-50 border-2 rounded-2xl font-bold text-sm text-[#181c3a] outline-none transition-all shadow-sm appearance-none ${!cacCarrier ? 'border-rose-300 bg-rose-50/20' : 'border-slate-100 focus:border-[#2ec4f1] focus:bg-white'}`}
                      >
                        <option value="">Seleccionar...</option>
                        {transportes.map((c: any) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                      <button className="w-14 h-14 bg-slate-50 border-2 border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-[#181c3a]">+</button>
                    </div>
                    {!cacCarrier && <p className="text-[8px] font-black text-rose-500 uppercase mt-2 ml-1">Campo Requerido</p>}
                  </div>

                  <div className="md:col-span-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 ml-1">Total Bultos</label>
                    <input
                      type="number"
                      placeholder="0"
                      min={0}
                      value={cacTotalCajas || ''}
                      onChange={e => setCacTotalCajas(parseInt(e.target.value) || 0)}
                      className={`w-full h-14 px-6 bg-slate-50 border-2 rounded-2xl font-bold text-sm text-[#181c3a] outline-none transition-all shadow-sm text-center ${cacTotalCajas < 1 ? 'border-rose-300 bg-rose-50/20' : 'border-slate-100 focus:border-[#2ec4f1] focus:bg-white'}`}
                    />
                    {cacTotalCajas < 1 && <p className="text-[8px] font-black text-rose-500 uppercase mt-2 ml-1 animate-pulse">Requerido para iniciar</p>}
                  </div>

                  <div className="md:col-span-1">
                    <button 
                      disabled={!cacPilot || !cacCarrier || cacTotalCajas < 1}
                      onClick={() => {
                        setIsIndustrialScanning(!isIndustrialScanning);
                        if (!isIndustrialScanning) {
                          setTimeout(() => scanInputRef.current?.focus(), 100);
                        }
                      }}
                      className={`w-full h-14 rounded-2xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg 
                        ${(!cacPilot || !cacCarrier || cacTotalCajas < 1) 
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none opacity-50' 
                          : isIndustrialScanning 
                            ? 'bg-emerald-500 text-white shadow-emerald-500/20' 
                            : 'bg-[#181c3a] text-white hover:bg-[#2ec4f1] hover:text-[#181c3a] shadow-[#181c3a]/10'
                        }`}
                    >
                      <Barcode size={18} /> {isIndustrialScanning && cacTotalCajas > 0 ? 'PISTOLEO ACTIVO' : 'INICIAR PISTOLEO'}
                    </button>
                  </div>
                </div>
              </div>
              <div className={`space-y-8 pb-10 transition-all duration-500 ${!isIndustrialScanning ? 'opacity-30 pointer-events-none grayscale' : 'opacity-100'}`}>
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#2ec4f1] text-[#181c3a] flex items-center justify-center font-black text-xs">2</div>
                    <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-widest">Paso 2: Área de "Pistoleo" Masivo (Escaneo)</h3>
                  </div>
                  {cacTotalCajas > 0 && (
                    <Badge className="bg-[#2ec4f1]/10 text-[#181c3a] border-none font-black text-xs px-4 py-2">
                      {cacScannedItems.length} {'/'} {cacTotalCajas} BULTOS CAPTURADOS
                    </Badge>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${isIndustrialScanning ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Escaneo Industrial Activo</p>
                  </div>
                  <form onSubmit={handleScan_CAC} className="flex gap-2 w-full">
                    <div className="relative flex-1">
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300">
                        <QrCode size={24} />
                      </div>
                      <input
                        ref={scanInputRef}
                        disabled={!isIndustrialScanning || cacTotalCajas < 1}
                        type="text"
                        placeholder={cacTotalCajas < 1 ? "INGRESE TOTAL BULTOS..." : "ESCANEE AQUÍ (Automático)..."}
                        value={cacScanInput}
                        onChange={e => { setCacScanInput(e.target.value); setCacError(''); }}
                        className={`w-full h-20 pl-16 pr-8 bg-white border-2 rounded-3xl font-black text-xl text-[#181c3a] outline-none transition-all shadow-xl shadow-blue-500/5 placeholder:font-bold placeholder:text-slate-300 uppercase ${cacTotalCajas < 1 ? 'border-rose-100 bg-rose-50/30' : 'border-[#2ec4f1]/20 focus:border-[#2ec4f1]'}`}
                      />
                    </div>
                    
                    <Button 
                      variant="outline" 
                      type="button"
                      onClick={() => setIsCameraScannerOpen(true)}
                      disabled={!isIndustrialScanning || cacTotalCajas < 1}
                      className="h-20 px-6 border-2 border-[#2ec4f1]/20 text-[#2ec4f1] rounded-3xl font-black hover:bg-[#2ec4f1] hover:text-[#181c3a] transition-all shadow-xl disabled:opacity-30 bg-white flex flex-col items-center justify-center gap-1"
                      title="Escanear con Cámara"
                    >
                      <Camera size={24} />
                      <span className="text-[9px] uppercase tracking-widest">Cámara</span>
                    </Button>

                    <Button 
                      variant="primary" 
                      type="submit"
                      disabled={!isIndustrialScanning || cacTotalCajas < 1}
                      className="h-20 px-12 bg-[#181c3a] text-white rounded-3xl font-black uppercase tracking-widest text-sm hover:bg-[#2ec4f1] hover:text-[#181c3a] transition-all shadow-xl disabled:opacity-30"
                    >
                      Añadir
                    </Button>
                  </form>
                  
                  {isCameraScannerOpen && (
                    <BarcodeScanner 
                      onClose={() => setIsCameraScannerOpen(false)}
                      onScanSuccess={(decodedText) => {
                        const newSn = decodedText.trim().toUpperCase();
                        if (newSn && !cacScannedItems.includes(newSn)) {
                           setCacScannedItems((prev: any) => [newSn, ...prev]);
                           setCacError('');
                        } else {
                           setCacError(`La serie ${newSn} ya fue escaneada o es inválida.`);
                        }
                      }}
                    />
                  )}

                  {cacError && (
                    <p className="text-xs font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-6 py-3 rounded-2xl border border-rose-100 inline-block animate-shake">{cacError}</p>
                  )}

                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Series Capturadas ({cacScannedItems.length})</p>
                      <button onClick={() => setCacScannedItems([])} className="text-[8px] font-black uppercase text-rose-400 hover:text-rose-600 tracking-tighter">Limpiar Lista</button>
                    </div>
                    
                    <div className="bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 p-8 min-h-[200px] relative shadow-inner">
                      {cacScannedItems.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-200 pointer-events-none">
                          <Barcode size={48} className="mb-4 opacity-20" />
                          <p className="text-xs font-black uppercase tracking-widest opacity-40">Esperando Escaneo...</p>
                        </div>
                      ) : (
                        <>
                        <div className="flex flex-wrap gap-3">
                          {cacScanPagination.slice.map((g: any, localIdx: number) => {
                            const globalIndex =
                              (cacScanPagination.page - 1) * CAC_SCAN_PAGE_SIZE + localIdx;
                            return (
                            <div key={globalIndex} className="bg-[#181c3a] text-white border border-[#2ec4f1]/30 rounded-xl px-5 py-3 flex items-center justify-between gap-4 group animate-rise-in shadow-lg">
                              <div className="flex flex-col">
                                <span className="text-[#2ec4f1] text-[8px] font-black mb-0.5">#{cacScannedItems.length - globalIndex}</span>
                                <span className="text-xs font-mono font-black">{g}</span>
                              </div>
                              <div className="flex items-center gap-1 border-l border-white/10 pl-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEditCACSeries(globalIndex)} className="p-1 hover:bg-[#2ec4f1]/20 rounded text-[#2ec4f1] transition-colors"><Pencil size={12} /></button>
                                <button onClick={() => handleDeleteCACSeries(globalIndex)} className="p-1 hover:bg-rose-500/20 rounded text-rose-400 transition-colors"><Trash2 size={12} /></button>
                              </div>
                            </div>
                          );
                          })}
                        </div>
                        {cacScannedItems.length > CAC_SCAN_PAGE_SIZE && (
                          <div className="mt-6 rounded-2xl overflow-hidden border border-slate-200">
                            <TablePagination
                              totalCount={cacScanPagination.totalCount}
                              page={cacScanPagination.page}
                              totalPages={cacScanPagination.totalPages}
                              startItem={cacScanPagination.startItem}
                              endItem={cacScanPagination.endItem}
                              pageSize={CAC_SCAN_PAGE_SIZE}
                              onPageChange={cacScanPagination.setPage}
                              itemLabel="series"
                            />
                          </div>
                        )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6">
                  <Button 
                    variant="outline" 
                    onClick={async () => {
                      if (await confirmDialog({ title: 'Cancelar recepción', message: '¿Seguro que desea cancelar la recepción actual?', confirmText: 'Sí, cancelar' })) {
                        setIsIndustrialScanning(false);
                        setCacScannedItems([]);
                        setCacError('');
                      }
                    }}
                    className="h-14 px-10 rounded-2xl border-2 border-slate-100 font-black text-xs uppercase text-slate-400 hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    variant="primary" 
                    onClick={handleFinalizeCAC}
                    disabled={cacScannedItems.length === 0 || loading}
                    className={`h-14 px-12 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl ${cacScannedItems.length >= cacTotalCajas && cacTotalCajas > 0 ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-[#181c3a] text-white hover:bg-[#2ec4f1] hover:text-[#181c3a]'}`}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Finalizar y Registrar Recepción
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
    </>
  );
};
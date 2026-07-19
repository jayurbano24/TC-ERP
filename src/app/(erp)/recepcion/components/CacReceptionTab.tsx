// @ts-nocheck
import React from 'react';
import { Card } from '@/components/ui/Card';
import { TablePagination } from '@/components/ui/TablePagination';
import BarcodeScanner from '@/components/BarcodeScanner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { confirmDialog, promptDialog } from '@/components/ui';
import { Camera, Truck, Barcode, QrCode, Pencil, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { useClientPagination } from '@/hooks/useClientPagination';

const CAC_SCAN_PAGE_SIZE = 20;

const fieldBase =
  'h-14 rounded-2xl border-2 px-6 text-sm font-bold text-[var(--foreground)] outline-none transition-all shadow-sm bg-[var(--surface-hover)]';
const fieldOk = 'border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)]';
const fieldErr = 'border-[var(--danger)]/50 bg-[var(--danger)]/10';

export const CacReceptionTab = ({
  cacAgency, setCacAgency, cacPilot, setCacPilot, cacCarrier, setCacCarrier,
  transportes = [], cacTotalCajas, setCacTotalCajas, isIndustrialScanning,
  setIsIndustrialScanning, scanInputRef, cacScannedItems, setCacScannedItems,
  cacScanInput, setCacScanInput, setCacError, setIsCameraScannerOpen,
  isCameraScannerOpen, cacError,
  handleFinalizeCAC, loading,
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
    const ok = await confirmDialog({
      title: 'Eliminar serie',
      message: '¿Eliminar esta serie?',
      tone: 'error',
      confirmText: 'Eliminar',
    });
    if (ok) {
      const updated = [...cacScannedItems];
      updated.splice(index, 1);
      setCacScannedItems(updated);
    }
  };

  return (
    <>
      <div className="space-y-6 animate-rise-in">
        <Card className="overflow-hidden rounded-3xl border-2 border-[var(--border)] p-0 shadow-2xl">
          <div className="flex items-center justify-between border-b-4 border-[var(--accent)] bg-[var(--surface-hover)] p-8 text-[var(--heading)]">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)]">
                <Truck size={24} />
              </div>
              <h2 className="text-2xl font-black tracking-tight uppercase">
                Nueva Recepción de Carga (CAC)
              </h2>
            </div>
          </div>

          <div className="space-y-12 p-10">
            <div className="space-y-6">
              <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--heading)] text-xs font-black text-[var(--surface)]">
                  1
                </div>
                <h3 className="text-sm font-black tracking-widest text-[var(--heading)] uppercase">
                  Paso 1: Encabezado de Recepción (Formulario)
                </h3>
              </div>

              <div className="grid grid-cols-1 items-end gap-6 md:grid-cols-4">
                <div className="md:col-span-1">
                  <label className="mb-3 ml-1 block text-[10px] font-black tracking-widest text-[var(--muted)] uppercase">
                    Transportista / Piloto
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre Piloto"
                    value={cacPilot}
                    onChange={(e) => setCacPilot(e.target.value)}
                    className={`w-full ${fieldBase} ${!cacPilot ? fieldErr : fieldOk}`}
                  />
                  {!cacPilot && (
                    <p className="mt-2 ml-1 text-[8px] font-black text-[var(--danger)] uppercase">
                      Campo Requerido
                    </p>
                  )}
                </div>

                <div className="md:col-span-1">
                  <label className="mb-3 ml-1 block text-[10px] font-black tracking-widest text-[var(--muted)] uppercase">
                    Empresa Logística
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={cacCarrier}
                      onChange={(e) => setCacCarrier(e.target.value)}
                      className={`flex-1 appearance-none ${fieldBase} ${!cacCarrier ? fieldErr : fieldOk}`}
                    >
                      <option value="">Seleccionar...</option>
                      {transportes.map((c: any) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[var(--border)] bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--heading)]"
                    >
                      +
                    </button>
                  </div>
                  {!cacCarrier && (
                    <p className="mt-2 ml-1 text-[8px] font-black text-[var(--danger)] uppercase">
                      Campo Requerido
                    </p>
                  )}
                </div>

                <div className="md:col-span-1">
                  <label className="mb-3 ml-1 block text-[10px] font-black tracking-widest text-[var(--muted)] uppercase">
                    Total Bultos
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    min={0}
                    value={cacTotalCajas || ''}
                    onChange={(e) => setCacTotalCajas(parseInt(e.target.value) || 0)}
                    className={`w-full text-center ${fieldBase} ${cacTotalCajas < 1 ? fieldErr : fieldOk}`}
                  />
                  {cacTotalCajas < 1 && (
                    <p className="mt-2 ml-1 animate-pulse text-[8px] font-black text-[var(--danger)] uppercase">
                      Requerido para iniciar
                    </p>
                  )}
                </div>

                <div className="md:col-span-1">
                  <button
                    type="button"
                    disabled={!cacPilot || !cacCarrier || cacTotalCajas < 1}
                    onClick={() => {
                      setIsIndustrialScanning(!isIndustrialScanning);
                      if (!isIndustrialScanning) {
                        setTimeout(() => scanInputRef.current?.focus(), 100);
                      }
                    }}
                    className={`flex h-14 w-full items-center justify-center gap-3 rounded-2xl text-[10px] font-black tracking-[0.2em] uppercase shadow-lg transition-all ${
                      !cacPilot || !cacCarrier || cacTotalCajas < 1
                        ? 'cursor-not-allowed bg-[var(--surface-hover)] text-[var(--muted)] opacity-50 shadow-none'
                        : isIndustrialScanning
                          ? 'bg-[var(--success)] text-white'
                          : 'bg-[var(--heading)] text-[var(--surface)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]'
                    }`}
                  >
                    <Barcode size={18} />{' '}
                    {isIndustrialScanning && cacTotalCajas > 0 ? 'PISTOLEO ACTIVO' : 'INICIAR PISTOLEO'}
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`space-y-8 pb-10 transition-all duration-500 ${
                !isIndustrialScanning ? 'pointer-events-none opacity-30 grayscale' : 'opacity-100'
              }`}
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-black text-[var(--accent-foreground)]">
                    2
                  </div>
                  <h3 className="text-sm font-black tracking-widest text-[var(--heading)] uppercase">
                    Paso 2: Área de &quot;Pistoleo&quot; Masivo (Escaneo)
                  </h3>
                </div>
                {cacTotalCajas > 0 && (
                  <Badge className="border-none bg-[var(--accent)]/10 px-4 py-2 text-xs font-black text-[var(--heading)]">
                    {cacScannedItems.length} / {cacTotalCajas} BULTOS CAPTURADOS
                  </Badge>
                )}
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-2 w-2 animate-pulse rounded-full ${
                      isIndustrialScanning ? 'bg-[var(--success)]' : 'bg-[var(--muted)]'
                    }`}
                  />
                  <p className="text-[10px] font-black tracking-widest text-[var(--success)] uppercase">
                    Escaneo Industrial Activo
                  </p>
                </div>

                <form onSubmit={handleScan_CAC} className="flex w-full gap-2">
                  <div className="relative flex-1">
                    <div className="absolute top-1/2 left-6 -translate-y-1/2 text-[var(--muted)]">
                      <QrCode size={24} />
                    </div>
                    <input
                      ref={scanInputRef}
                      disabled={!isIndustrialScanning || cacTotalCajas < 1}
                      type="text"
                      placeholder={
                        cacTotalCajas < 1 ? 'INGRESE TOTAL BULTOS...' : 'ESCANEE AQUÍ (Automático)...'
                      }
                      value={cacScanInput}
                      onChange={(e) => {
                        setCacScanInput(e.target.value);
                        setCacError('');
                      }}
                      className={`h-20 w-full rounded-3xl border-2 bg-[var(--surface)] pr-8 pl-16 text-xl font-black text-[var(--foreground)] uppercase outline-none transition-all placeholder:font-bold placeholder:text-[var(--muted)] ${
                        cacTotalCajas < 1
                          ? 'border-[var(--danger)]/30 bg-[var(--danger)]/10'
                          : 'border-[var(--accent)]/20 focus:border-[var(--accent)]'
                      }`}
                    />
                  </div>

                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setIsCameraScannerOpen(true)}
                    disabled={!isIndustrialScanning || cacTotalCajas < 1}
                    className="flex h-20 flex-col items-center justify-center gap-1 rounded-3xl border-2 border-[var(--accent)]/20 px-6 font-black text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
                    title="Escanear con Cámara"
                  >
                    <Camera size={24} />
                    <span className="text-[9px] tracking-widest uppercase">Cámara</span>
                  </Button>

                  <Button
                    variant="primary"
                    type="submit"
                    disabled={!isIndustrialScanning || cacTotalCajas < 1}
                    className="h-20 rounded-3xl px-12 text-sm font-black tracking-widest uppercase"
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
                  <p className="inline-block animate-shake rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-6 py-3 text-xs font-black tracking-widest text-[var(--danger)] uppercase">
                    {cacError}
                  </p>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <p className="text-[10px] font-black tracking-widest text-[var(--muted)] uppercase">
                      Series Capturadas ({cacScannedItems.length})
                    </p>
                    <button
                      type="button"
                      onClick={() => setCacScannedItems([])}
                      className="text-[8px] font-black tracking-tighter text-[var(--danger)] uppercase hover:opacity-80"
                    >
                      Limpiar Lista
                    </button>
                  </div>

                  <div className="relative min-h-[200px] rounded-[2rem] border-2 border-dashed border-[var(--border)] bg-[var(--surface-hover)] p-8 shadow-inner">
                    {cacScannedItems.length === 0 ? (
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-[var(--muted)]">
                        <Barcode size={48} className="mb-4 opacity-20" />
                        <p className="text-xs font-black tracking-widest uppercase opacity-40">
                          Esperando Escaneo...
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-3">
                          {cacScanPagination.slice.map((g: any, localIdx: number) => {
                            const globalIndex =
                              (cacScanPagination.page - 1) * CAC_SCAN_PAGE_SIZE + localIdx;
                            return (
                              <div
                                key={globalIndex}
                                className="group flex animate-rise-in items-center justify-between gap-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--heading)] px-5 py-3 text-[var(--surface)] shadow-lg"
                              >
                                <div className="flex flex-col">
                                  <span className="mb-0.5 text-[8px] font-black text-[var(--accent)]">
                                    #{cacScannedItems.length - globalIndex}
                                  </span>
                                  <span className="font-mono text-xs font-black">{g}</span>
                                </div>
                                <div className="flex items-center gap-1 border-l border-white/10 pl-3 opacity-0 transition-opacity group-hover:opacity-100">
                                  <button
                                    type="button"
                                    onClick={() => handleEditCACSeries(globalIndex)}
                                    className="rounded p-1 text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCACSeries(globalIndex)}
                                    className="rounded p-1 text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/20"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {cacScannedItems.length > CAC_SCAN_PAGE_SIZE && (
                          <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)]">
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
                    if (
                      await confirmDialog({
                        title: 'Cancelar recepción',
                        message: '¿Seguro que desea cancelar la recepción actual?',
                        confirmText: 'Sí, cancelar',
                      })
                    ) {
                      setIsIndustrialScanning(false);
                      setCacScannedItems([]);
                      setCacError('');
                    }
                  }}
                  className="h-14 rounded-2xl px-10 text-xs font-black uppercase"
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  onClick={handleFinalizeCAC}
                  disabled={cacScannedItems.length === 0 || loading}
                  className={`h-14 rounded-2xl px-12 text-xs font-black tracking-widest uppercase shadow-xl ${
                    cacScannedItems.length >= cacTotalCajas && cacTotalCajas > 0
                      ? '!bg-[var(--success)]'
                      : ''
                  }`}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
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

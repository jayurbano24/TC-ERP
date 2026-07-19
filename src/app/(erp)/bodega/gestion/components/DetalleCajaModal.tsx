'use client';

import { memo, useMemo, type FormEvent } from 'react';
import { Card, Badge, Button, DataTable, type DataTableColumn } from '@/components/ui';
import {
  Warehouse, Cpu, MapPin, QrCode, Info, Calendar, PackageCheck,
  ArrowRight, History, Eye, Pencil, Printer, Trash2,
} from 'lucide-react';

type Props = {
  selectedBox: any;
  loadingSeries?: boolean;
  catMarcas: any[];
  catModelos: any[];
  catTecnologias: any[];
  currentSN: string;
  setCurrentSN: (v: string) => void;
  lastScannedInfo: any;
  onAddSN: (e: FormEvent) => void;
  onShowTimeline: (item: any) => void;
  onRemoveUnit: (item: any) => void;
  onClose: () => void;
};

/**
 * C1: modal de detalle/cierre de caja ("Ingreso Inteligente") extraído del
 * monolito bodega/gestion y memoizado. El estado/DB vive en el padre.
 */
export const DetalleCajaModal = memo(function DetalleCajaModal({
  selectedBox,
  loadingSeries = false,
  catMarcas,
  catModelos,
  catTecnologias,
  currentSN,
  setCurrentSN,
  lastScannedInfo,
  onAddSN,
  onShowTimeline,
  onRemoveUnit,
  onClose,
}: Props) {
  const seriesCount = selectedBox.series?.length ?? 0;
  const unitTotal = Math.max(selectedBox.cantidad || 0, selectedBox.unitCount || 0, seriesCount, 1);
  const uniqueEquipmentsCount =
    seriesCount > 0
      ? new Set(selectedBox.series?.map((s: any) => s.service_orders?.id || s.serial_number)).size
      : selectedBox.unitCount || 0;

  // Lookups O(1) para evitar .find() por celda (importante con muchas unidades).
  const marcaMap = useMemo(() => new Map(catMarcas.map((b) => [b.id, b.name])), [catMarcas]);
  const modeloMap = useMemo(() => new Map(catModelos.map((m) => [m.id, m.name])), [catModelos]);
  const tecMap = useMemo(() => new Map(catTecnologias.map((t) => [t.id, t.name])), [catTecnologias]);

  const seriesColumns = useMemo<DataTableColumn<any>[]>(() => [
    { id: 'fecha', header: 'Fecha / Hora', width: '150px', cell: (item) => <span className="text-[10px] font-bold text-[var(--foreground)]">{item.fechaHora || item.timestamp}</span> },
    { id: 'guia', header: 'No. Guía', width: '130px', cell: (item) => <span className="text-[10px] font-mono font-bold text-[var(--heading)]">{item.guia || item.agencia}</span> },
    { id: 'piloto', header: 'Piloto', width: '110px', cell: (item) => <span className="text-[10px] font-medium text-[var(--foreground)]">{item.piloto || '---'}</span> },
    { id: 'courier', header: 'Courier', width: '100px', cell: (item) => <span className="text-[10px] font-medium text-[var(--muted)]">{item.origen || '---'}</span> },
    { id: 'recibio', header: 'Recibió', width: '120px', cell: (item) => <span className="text-[10px] font-medium text-[var(--foreground)]">{item.recibio || 'Admin'}</span> },
    { id: 'estatus', header: 'Estatus', width: '160px', cell: (item) => {
      const raw = String(item.current_status || item.estatusSerie || '').toLowerCase();
      const label =
        raw === 'in_workshop' || raw.includes('diagn')
          ? 'TALLER'
          : raw === 'in_repair' || raw.includes('repair')
            ? 'REPARACIÓN'
            : raw === 'in_qc' || raw.includes('qc')
              ? 'CONTROL CALIDAD'
              : raw === 'ready_to_dispatch' || raw.includes('ready')
                ? 'LISTO'
                : raw === 'in_control_warehouse'
                  ? 'BODEGA CONTROL'
                  : 'BODEGA PRINCIPAL';
      return (
        <span className="text-[9px] font-black tracking-widest bg-[var(--heading)] text-[var(--surface)] px-2 py-1 rounded-full">
          {label}
        </span>
      );
    } },
    { id: 'os', header: 'Orden Servicio', width: '120px', cell: (item) => <span className="text-[10px] font-black text-[var(--accent)]">{item.ordenServicio || '---'}</span> },
    { id: 'ingreso', header: 'Ingreso', width: '110px', cell: (item) => <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2 py-1 rounded-full">{item.ingreso || '1° Ingreso'}</span> },
    { id: 'agencia', header: 'Agencia CAC', width: '150px', cell: (item) => <span className="text-[10px] font-bold text-[var(--foreground)]">{item.agenciaCAC || '---'}</span> },
    { id: 'tec', header: 'Tecnología', width: '110px', cell: (item) => <span className="text-[10px] font-bold text-[var(--accent)]">{tecMap.get(item.tecnologia) || item.tecnologia || '---'}</span> },
    { id: 'marca', header: 'Marca', width: '110px', cell: (item) => <span className="text-[10px] font-bold text-[var(--foreground)]">{marcaMap.get(item.marca) || item.marca || '---'}</span> },
    { id: 'modelo', header: 'Modelo', width: '120px', cell: (item) => <span className="text-[10px] font-bold text-[var(--foreground)]">{modeloMap.get(item.modelo) || item.modelo || '---'}</span> },
    { id: 's1', header: 'S-1', width: '150px', cell: (item) => (item.s1 || item.sn) ? <span className="inline-block px-2 py-1 bg-[var(--surface-hover)] text-[10px] font-mono font-black text-[var(--heading)] rounded-md">{item.s1 || item.sn}</span> : <span className="text-[var(--muted)]">---</span> },
    { id: 's2', header: 'S-2', width: '150px', cell: (item) => item.s2 ? <span className="inline-block px-2 py-1 bg-[var(--surface-hover)] text-[10px] font-mono font-bold text-[var(--heading)] rounded-md">{item.s2}</span> : <span className="text-[var(--muted)]">---</span> },
    { id: 's3', header: 'S-3', width: '150px', cell: (item) => item.s3 ? <span className="inline-block px-2 py-1 bg-[var(--surface-hover)] text-[10px] font-mono font-bold text-[var(--heading)] rounded-md">{item.s3}</span> : <span className="text-[var(--muted)]">---</span> },
    { id: 's4', header: 'S-4', width: '150px', cell: (item) => item.s4 ? <span className="inline-block px-2 py-1 bg-[var(--surface-hover)] text-[10px] font-mono font-bold text-[var(--heading)] rounded-md">{item.s4}</span> : <span className="text-[var(--muted)]">---</span> },
    { id: 'material', header: 'Material', width: '100px', cell: (item) => <span className="text-[10px] font-bold text-[var(--foreground)]">{item.material || '---'}</span> },
    { id: 'lote', header: 'Lote', width: '100px', cell: (item) => <span className="text-[10px] font-bold text-[var(--foreground)]">{item.lote || '---'}</span> },
    {
      id: 'actions', header: '', width: '170px', align: 'right', cell: (item) => (
        <div className="flex items-center justify-end gap-1 opacity-60 hover:opacity-100 transition-opacity">
          <button onClick={() => onShowTimeline(item)} className="p-1.5 bg-[var(--surface-hover)] hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] text-[var(--muted)] rounded-lg transition-colors" title="Historial"><History className="w-3.5 h-3.5" /></button>
          <button className="p-1.5 bg-[var(--surface-hover)] hover:bg-[var(--surface-hover)] text-[var(--muted)] rounded-lg transition-colors" title="Ver Detalles"><Eye className="w-3.5 h-3.5" /></button>
          <button className="p-1.5 bg-[var(--surface-hover)] hover:bg-[var(--surface-hover)] text-[var(--muted)] rounded-lg transition-colors" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
          <button className="p-1.5 bg-[var(--surface-hover)] hover:bg-[var(--surface-hover)] text-[var(--muted)] rounded-lg transition-colors" title="Imprimir Etiqueta"><Printer className="w-3.5 h-3.5" /></button>
          <button onClick={() => onRemoveUnit(item)} className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-lg transition-colors ml-1" title="Eliminar de la caja"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ),
    },
  ], [marcaMap, modeloMap, tecMap, onShowTimeline, onRemoveUnit]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm">
      <div className="w-[95vw] max-w-none h-full bg-[var(--surface)] shadow-2xl animate-slide-in-right flex flex-col">
        <div className="border-b border-[var(--border)] bg-[var(--surface)] p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Warehouse className="w-40 h-40 text-[var(--heading)]" />
          </div>

          <div className="relative z-10">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="blue" className="bg-[var(--accent)]/15 text-[var(--accent)] border-none">ID: {selectedBox.id}</Badge>
                  <Badge variant="slate" className="bg-[var(--surface-hover)] text-[var(--muted)] border border-[var(--border)]">INGRESO INTELIGENTE</Badge>
                </div>
                <h3 className="text-3xl font-black text-[var(--heading)]">
                  {catMarcas.find(b => b.id === selectedBox.marca)?.name || selectedBox.marca} - {catModelos.find(m => m.id === selectedBox.modelo)?.name || selectedBox.modelo}
                </h3>
                <div className="flex items-center gap-4 mt-2 text-[var(--muted)]">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest">
                    <Cpu className="w-3 h-3 text-[var(--accent)]" /> {catTecnologias.find(t => t.id === selectedBox.series[0]?.tecnologia)?.name || selectedBox.series[0]?.tecnologia || 'N/A'}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest">
                    <MapPin className="w-3 h-3 text-[var(--accent)]" /> {selectedBox.rack}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-2 text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]" aria-label="Cerrar">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--surface-hover)] rounded-2xl p-6 border border-[var(--border)]">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] leading-none">Progreso Caja</span>
                  <span className="text-2xl font-black text-[var(--accent)] leading-none">
                    {uniqueEquipmentsCount} <span className="text-sm text-[var(--muted)]">/ {unitTotal}</span>
                  </span>
                </div>
                <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] transition-all duration-500"
                    style={{ width: `${Math.min((uniqueEquipmentsCount / unitTotal) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div className="bg-[var(--accent)]/10 rounded-2xl p-6 border border-[var(--accent)]/20 flex flex-col justify-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] mb-1">Estatus Bodega</span>
                <span className="text-lg font-black text-[var(--heading)]">{selectedBox.status.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-[var(--surface-hover)]/30">
          {/* Ocultar sección de escaneo si la caja ya está llena */}
          {uniqueEquipmentsCount < unitTotal && !loadingSeries && (
            <>
              {/* Buscador Inteligente */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <QrCode className="w-5 h-5 text-[var(--accent)]" />
                    <h4 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">Pistoleo de Verificación</h4>
                  </div>
                  <span className="text-[10px] font-bold text-[var(--muted)] italic">Sincronizado con Recepción / Backoffice</span>
                </div>
                <form onSubmit={onAddSN} className="flex gap-3">
                  <input
                    type="text"
                    autoFocus
                    className="flex-1 h-16 px-6 bg-[var(--surface)] border-2 border-[var(--border)] rounded-2xl text-xl font-mono font-bold outline-none focus:border-[var(--accent)] shadow-sm transition-all"
                    placeholder="Escanee SN del equipo..."
                    value={currentSN}
                    onChange={e => setCurrentSN(e.target.value)}
                  />
                  <Button type="submit" className="h-16 px-8 rounded-2xl shadow-lg">
                    <ArrowRight className="w-6 h-6" />
                  </Button>
                </form>
              </div>

              {/* Detalle del Último Escaneo (Auto-fetch) */}
              {lastScannedInfo && (
                <div className="animate-rise-in">
                  <Card className="border-2 border-[var(--accent)]/30 bg-[var(--surface)] p-6 shadow-xl shadow-[var(--accent)]/5">
                    <div className="flex items-start gap-4">
                      <div className="bg-[var(--accent)]/10 p-3 rounded-2xl">
                        <Info className="w-6 h-6 text-[var(--accent)]" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-xs font-black uppercase tracking-widest text-[var(--muted)]">Información de Origen</h4>
                              {lastScannedInfo.serviceOrder !== 'S/OS' && (
                                <Badge className="bg-amber-100 text-amber-700 font-black text-[9px] px-2 py-0.5 border-none">
                                  OS: {lastScannedInfo.serviceOrder}
                                </Badge>
                              )}
                            </div>
                            <h5 className="text-lg font-black text-[var(--heading)] leading-none mb-1">
                              {lastScannedInfo.agency || lastScannedInfo.agencia}
                            </h5>
                            <span className="text-sm font-bold text-[var(--muted)]">
                              {lastScannedInfo.courier} • Piloto: {lastScannedInfo.driver || lastScannedInfo.piloto}
                            </span>
                          </div>
                          <Badge className="bg-emerald-100 text-emerald-700 border-none font-black">
                            ✓ VALIDADO
                          </Badge>
                        </div>

                        <div className="grid grid-cols-4 gap-2 border-t border-[var(--border)] pt-4">
                          {['s1', 's2', 's3', 's4'].map((key, idx) => (
                            <div key={key} className={`rounded-lg p-2 ${lastScannedInfo[key] ? 'bg-[var(--accent)]/5 border border-[var(--accent)]/20' : 'bg-[var(--surface-hover)] opacity-40'}`}>
                              <span className="block text-[8px] font-black text-[var(--muted)] uppercase mb-0.5">S-{idx + 1}</span>
                              <span className="text-[10px] font-mono font-black text-[var(--heading)] break-all">{lastScannedInfo[key] || '---'}</span>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-4 bg-[var(--surface-hover)] p-3 rounded-xl">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-[var(--muted)]" />
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black text-[var(--muted)] uppercase">Recibido en Guía</span>
                              <span className="text-[10px] font-bold text-[var(--foreground)]">{lastScannedInfo.fechaGuia}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <PackageCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black text-[var(--muted)] uppercase">Auditado Recepción</span>
                              <span className="text-[10px] font-bold text-[var(--accent)]">{lastScannedInfo.fechaRecepcion}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}

          {/* Listado de Series en Caja - Tabla Detallada */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] flex items-center gap-2">
              Contenido de la Caja <span className="w-1.5 h-1.5 rounded-full bg-[var(--border)]" /> {loadingSeries ? 'Cargando…' : `${seriesCount || selectedBox.unitCount || 0} Unidades`}
            </h4>

            <div className="rounded-xl border border-[var(--border)] shadow-sm bg-[var(--surface)] overflow-hidden">
              {loadingSeries ? (
                <div className="py-16 text-center text-sm text-[var(--muted)]">Cargando series de la caja…</div>
              ) : (
              <DataTable
                columns={seriesColumns}
                data={selectedBox.series}
                getRowId={(item, i) => (item.sn || item.ordenServicio ? `${item.sn || item.ordenServicio}-${i}` : i)}
                rowHeight={52}
                maxBodyHeight={560}
                virtualizeThreshold={20}
                minWidth={2230}
                headerClassName="bg-[var(--surface-hover)] border-b border-[var(--border)]"
                headerTextClassName="text-[var(--muted)]"
                emptyMessage="Sin unidades en la caja"
              />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

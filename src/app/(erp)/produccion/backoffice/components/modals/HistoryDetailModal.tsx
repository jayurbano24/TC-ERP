'use client';

import { Badge, Button, Card } from '@/components/ui';
import { SapValidationBadge } from '@/components/sap/SapValidationBadge';
import { normalizeSeriesSapStatus, resolveUnitSapStatus } from '@/lib/sap/sapValidationStatus';
import { Database, Plus, Printer } from 'lucide-react';
import { getAgenciaLabel, getReceiverName } from '../../backofficeHelpers';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../../types';

type Props = {
  reception: any;
  series: any[];
  agencies: CatalogAgency[];
  technologies: CatalogTech[];
  brands: CatalogBrand[];
  models: CatalogModel[];
  onPrint: () => void;
  onClose: () => void;
};

export function HistoryDetailModal({ reception, series, agencies, technologies, brands, models, onPrint, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xl p-6">
      <Card className="w-full max-w-5xl bg-[var(--surface)] rounded-[2.5rem] shadow-2xl overflow-hidden border border-[var(--border)] animate-rise-in p-0 flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="bg-[var(--surface-hover)] border-b border-[var(--border)] p-8 flex justify-between items-start shrink-0">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--muted)] mb-1">Detalle de Mercadería — Backoffice</p>
            <h3 className="text-2xl font-black uppercase tracking-tight text-[var(--heading)]">Guía {reception.guide_number}</h3>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
            className="w-10 h-10 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-all mt-1"
            aria-label="Cerrar"
          >
            <Plus size={20} className="rotate-45" />
          </button>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-6 bg-[var(--background)] border-b border-[var(--border)] shrink-0">
          <div className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)]">
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">Agencia CAC</p>
            <p className="text-sm font-black text-[var(--heading)] uppercase leading-tight">
              {getAgenciaLabel(reception, agencies)}
            </p>
          </div>
          <div className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)]">
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">Tecnología</p>
            <p className="text-sm font-black text-[var(--heading)] uppercase leading-tight">
              {(() => {
                const equipSeries = series.filter((s: any) => s.brand_id);
                const firstEquip = equipSeries[0];
                const modelObj = firstEquip ? models.find((m) => m.id === firstEquip.model_id) : null;
                const techFromSeries = modelObj
                  ? technologies.find((t) => t.id === modelObj.tecnologiaId)?.nombre || ''
                  : '';
                const notesTech = reception.notes?.includes('Backoffice_Tech: ')
                  ? reception.notes.split('Backoffice_Tech: ')[1]?.split('\n')[0]?.trim()
                  : '';
                return techFromSeries || notesTech || <span className="text-[var(--muted)]">—</span>;
              })()}
            </p>
          </div>
          <div className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)]">
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">Marca</p>
            <p className="text-sm font-black text-[var(--heading)] uppercase leading-tight">
              {(() => {
                const equipSeries = series.filter((s: any) => s.brand_id);
                const firstEquip = equipSeries[0];
                const brandFromSeries = firstEquip
                  ? brands.find((b) => b.id === firstEquip.brand_id)?.nombre || ''
                  : '';
                const notesBrand = reception.notes?.includes('Backoffice_Brand: ')
                  ? reception.notes.split('Backoffice_Brand: ')[1]?.split('\n')[0]?.trim()
                  : '';
                return brandFromSeries || notesBrand || <span className="text-[var(--muted)]">—</span>;
              })()}
            </p>
          </div>
          <div className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)]">
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">Modelo</p>
            <p className="text-sm font-black text-[var(--heading)] uppercase leading-tight">
              {(() => {
                const equipSeries = series.filter((s: any) => s.brand_id);
                const firstEquip = equipSeries[0];
                const modelObj = firstEquip ? models.find((m) => m.id === firstEquip.model_id) : null;
                const modelFromSeries = modelObj?.nombre || '';
                const notesModel = reception.notes?.includes('Backoffice_Model: ')
                  ? reception.notes.split('Backoffice_Model: ')[1]?.split('\n')[0]?.trim()
                  : '';
                return modelFromSeries || notesModel || <span className="text-[var(--muted)]">---</span>;
              })()}
            </p>
          </div>
          <div className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)]">
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">Piloto</p>
            <p className="text-sm font-black text-[var(--heading)] uppercase leading-tight">
              {reception.notes?.split('Piloto: ')[1]?.split('\n')[0]?.trim() || '---'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-6 pb-4 bg-[var(--background)] border-b border-[var(--border)] shrink-0">
          <div className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)]">
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">Courier</p>
            <p className="text-sm font-black text-[var(--heading)] uppercase leading-tight">{reception.carrier || '---'}</p>
          </div>
          <div className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)]">
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">Recibido en Backoffice</p>
            <p className="text-sm font-black text-[var(--heading)] uppercase leading-tight">{getReceiverName(reception)}</p>
          </div>
          <div className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)]">
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">Estatus</p>
            <span className="text-[9px] uppercase font-black tracking-widest text-[var(--accent)]">
              {reception.status}
            </span>
          </div>
        </div>

        {/* Series table */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {(() => {
            const equipModalSeries = series.filter((s: any) => s.brand_id);
            const guideModalSeries = series.filter((s: any) => !s.brand_id);
            return (
              <>
                <div className="mb-4">
                  <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-2 px-1">
                    Series de Equipo ({equipModalSeries.length})
                  </p>
                  <div className="overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm bg-[var(--surface)]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[var(--surface-hover)] text-[var(--heading)] border-b border-[var(--border)]">
                          <th className="p-3 text-[8px] font-black uppercase tracking-widest">#</th>
                          <th className="p-3 text-[8px] font-black uppercase tracking-widest">No. de Serie</th>
                          <th className="p-3 text-[8px] font-black uppercase tracking-widest">Tecnología</th>
                          <th className="p-3 text-[8px] font-black uppercase tracking-widest">Marca</th>
                          <th className="p-3 text-[8px] font-black uppercase tracking-widest">Modelo</th>
                          <th className="p-3 text-[8px] font-black uppercase tracking-widest">Validación SAP</th>
                          <th className="p-3 text-[8px] font-black uppercase tracking-widest">No. Guía</th>
                          <th className="p-3 text-[8px] font-black uppercase tracking-widest text-right">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {equipModalSeries.map((s: any, idx: number) => {
                          const brand = brands.find((b) => b.id === s.brand_id)?.nombre || s.brand_id || '---';
                          const modelObj = models.find((m) => m.id === s.model_id);
                          const model = modelObj?.nombre || s.model_id || '---';
                          const tech = modelObj
                            ? technologies.find((t) => t.id === modelObj.tecnologiaId)?.nombre || '---'
                            : '---';
                          const sapStatus = resolveUnitSapStatus(s.service_orders?.sap_integration_status, [
                            s.sap_status,
                          ]);
                          return (
                            <tr key={idx} className="hover:bg-[var(--surface-hover)] transition-colors">
                              <td className="p-3 text-[9px] font-black text-[var(--muted)]">S-{idx + 1}</td>
                              <td className="p-3 font-mono font-black text-[var(--heading)] text-xs">{s.serial_number}</td>
                              <td className="p-3 text-[10px] font-bold text-[var(--muted)] uppercase">{tech}</td>
                              <td className="p-3 text-[10px] font-bold text-[var(--muted)] uppercase">{brand}</td>
                              <td className="p-3 text-[10px] font-bold text-[var(--muted)] uppercase">{model}</td>
                              <td className="p-3">
                                <SapValidationBadge status={sapStatus} compact />
                                <span className="block text-[8px] text-[var(--muted)] mt-0.5 uppercase font-bold">
                                  {normalizeSeriesSapStatus(s.sap_status)}
                                </span>
                              </td>
                              <td className="p-3 font-mono text-[10px] font-black text-[var(--heading)]">
                                {reception.guide_number}
                              </td>
                              <td className="p-3 text-right">
                                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-none text-[8px] uppercase font-black px-2 py-0.5">
                                  Recibido
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {guideModalSeries.length > 0 && (
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] mb-2 px-1">
                      Guías / Cajas recibidas ({guideModalSeries.length})
                    </p>
                    <div className="overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm bg-[var(--surface)]">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[var(--surface-hover)] border-b border-[var(--border)]">
                            <th className="p-3 text-[8px] font-black uppercase tracking-widest text-[var(--muted)]">#</th>
                            <th className="p-3 text-[8px] font-black uppercase tracking-widest text-[var(--muted)]">
                              No. de Guía / Caja
                            </th>
                            <th className="p-3 text-[8px] font-black uppercase tracking-widest text-[var(--muted)] text-right">
                              Estado
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {guideModalSeries.map((s: any, idx: number) => (
                            <tr key={idx} className="hover:bg-[var(--surface-hover)] transition-colors">
                              <td className="p-3 text-[9px] font-black text-[var(--muted)]">{idx + 1}</td>
                              <td className="p-3 font-mono font-black text-[var(--heading)] text-xs">{s.serial_number}</td>
                              <td className="p-3 text-right">
                                <Badge className="bg-[var(--accent)]/15 text-[var(--accent)] border-none text-[8px] uppercase font-black px-2 py-0.5">
                                  En Proceso
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {series.length === 0 && (
                  <div className="py-16 text-center border-2 border-dashed border-[var(--border)] rounded-3xl bg-[var(--surface)]">
                    <Database className="w-12 h-12 text-[var(--muted)] mx-auto mb-4 opacity-40" />
                    <p className="text-xs font-black text-[var(--muted)] uppercase tracking-widest">
                      No se han registrado series para este manifiesto aún
                    </p>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        <div className="p-6 bg-[var(--surface)] border-t border-[var(--border)] flex justify-between items-center shrink-0">
          <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest">
            {series.filter((s: any) => s.brand_id).length} equipos -{' '}
            {series.filter((s: any) => !s.brand_id).length} guias
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8"
              onClick={() => onPrint()}
              leftIcon={<Printer className="w-4 h-4" />}
            >
              Imprimir PDF
            </Button>
            <Button
              variant="primary"
              className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8"
              onClick={() => onClose()}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

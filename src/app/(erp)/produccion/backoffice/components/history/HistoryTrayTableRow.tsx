'use client';

import { Badge } from '@/components/ui';
import { SapValidationBadge, SeriesSapValidationDots } from '@/components/sap/SapValidationBadge';
import { resolveUnitSapStatus } from '@/lib/sap/sapValidationStatus';
import { Clock, Edit2, Eye, Printer, RefreshCw, RotateCcw } from 'lucide-react';
import { formatAgencyLabel, getBackofficeClassifierName, type HistoryUnitEntry } from '../../historyTrayUtils';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../../types';

export type HistoryTrayRowActions = {
  onSapBlockReturn: (entry: HistoryUnitEntry) => void;
  onReturnToPending: (receptionId: string) => void;
  onShowTimeline: (rec: unknown) => void;
  onOpenHistoryModal: (rec: unknown) => void;
  onOpenEditMeta: (rec: unknown) => void;
  onPrintConduce: (rec: unknown) => void;
};

type Props = HistoryTrayRowActions & {
  entry: HistoryUnitEntry;
  rowIdx: number;
  canReturnToPending: boolean;
  CAC_AGENCIES: CatalogAgency[];
  MASTER_TECNOLOGIAS: CatalogTech[];
  MASTER_MARCAS: CatalogBrand[];
  MASTER_MODELOS: CatalogModel[];
};

export function HistoryTrayTableRow({
  entry,
  rowIdx,
  canReturnToPending,
  CAC_AGENCIES,
  MASTER_TECNOLOGIAS,
  MASTER_MARCAS,
  MASTER_MODELOS,
  onSapBlockReturn,
  onReturnToPending,
  onShowTimeline,
  onOpenHistoryModal,
  onOpenEditMeta,
  onPrintConduce,
}: Props) {
  const rec = entry.rec;
  const grp = entry.grp;
  const unit = entry.unit;
  const osLabel = entry.osLabel;
  const dateObj = new Date(entry.classifiedAtIso);
  const formattedDate = `${dateObj.getDate()}-${dateObj.getMonth() + 1}-${dateObj.getFullYear()} ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
  const piloto = rec.notes?.split('Piloto: ')[1]?.split('\n')[0] || '---';
  const bandBg = rowIdx % 2 === 0 ? '' : 'bg-[var(--surface-hover)]/80';
  const unitGuide = entry.unitGuide;
  const classifierName = getBackofficeClassifierName(rec, unitGuide);
  const modelObj = MASTER_MODELOS.find((m) => m.id === grp.modelId);
  const brandObj = MASTER_MARCAS.find((b) => b.id === grp.brandId);
  const techObj = modelObj ? MASTER_TECNOLOGIAS.find((t) => t.id === modelObj.tecnologiaId) : null;
  const reentry =
    unit.find((u: { service_orders?: { reentry_count?: number } }) => u?.service_orders?.reentry_count)
      ?.service_orders?.reentry_count || 1;
  const seriesSapStatuses =
    entry.seriesSapStatuses ??
    unit.map((u: { sap_status?: string | null }) => u.sap_status || 'Pendiente');
  const unitSapValidationStatus =
    entry.unitSapValidationStatus ??
    resolveUnitSapStatus(unit[0]?.service_orders?.sap_integration_status, seriesSapStatuses);

  return (
    <tr className={`border-b border-[var(--border)] transition-colors hover:bg-[#2ec4f1]/10 ${bandBg}`}>
      <td className="px-4 py-3 text-[11px] font-bold text-[var(--foreground)] whitespace-nowrap">{formattedDate}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-[11px] font-black font-mono text-[var(--foreground)]">{unitGuide}</span>
      </td>
      <td className="px-4 py-3 text-[11px] font-black text-[var(--muted)] uppercase whitespace-nowrap">{piloto}</td>
      <td className="px-4 py-3 text-[11px] text-[var(--muted)] uppercase whitespace-nowrap">{rec.carrier || '---'}</td>
      <td className="px-4 py-3 text-[11px] text-[var(--muted)] whitespace-nowrap">{classifierName}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span
          className={`text-[9px] uppercase font-black tracking-widest px-3 py-1 rounded-full ${
            entry.unitStatus === 'RECEPCIONADO_BODEGA_GENERAL'
              ? 'bg-amber-50 text-amber-700'
              : entry.unitStatus === 'returned'
                ? 'bg-rose-50 text-rose-600'
                : 'bg-blue-50 text-blue-600'
          }`}
        >
          {entry.unitStatusLabel}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <Badge className="bg-blue-50 text-blue-600 border-none font-black text-[10px] px-2 py-0.5">{osLabel}</Badge>
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap">
        <Badge
          className={`border-none font-black text-[10px] px-2 py-0.5 ${reentry > 1 ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-[var(--surface-hover)] text-[var(--muted)]'}`}
        >
          {reentry} Ingreso
        </Badge>
      </td>
      <td className="px-4 py-3 text-[11px] font-bold text-[var(--foreground)] uppercase whitespace-nowrap">
        {formatAgencyLabel(entry.unitAgencyRaw, CAC_AGENCIES, rec.carrier)}
      </td>
      <td className="px-4 py-3 text-[11px] font-black text-[var(--muted)] uppercase whitespace-nowrap">{techObj?.nombre || '---'}</td>
      <td className="px-4 py-3 text-[11px] font-black text-[var(--muted)] uppercase whitespace-nowrap">{brandObj?.nombre || '---'}</td>
      <td className="px-4 py-3 text-[11px] font-bold text-[var(--foreground)] whitespace-nowrap">{modelObj?.nombre || '---'}</td>
      <td className="px-4 py-3 text-[11px] font-bold text-[var(--muted)] uppercase whitespace-nowrap">{entry.unitSap}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex flex-col gap-1 items-start">
          <SapValidationBadge status={unitSapValidationStatus} />
          <SeriesSapValidationDots statuses={seriesSapStatuses} />
        </div>
      </td>
      {[0, 1, 2, 3].map((si) => (
        <td key={si} className="px-4 py-3 text-[11px] font-mono font-bold text-[var(--muted)] whitespace-nowrap">
          {unit[si]?.serial_number ? (
            <span className="bg-[var(--surface-hover)] px-2 py-0.5 rounded text-[10px] tracking-wide">{unit[si].serial_number}</span>
          ) : (
            ''
          )}
        </td>
      ))}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="flex justify-end gap-1">
          <button type="button" onClick={() => onSapBlockReturn(entry)} className="w-6 h-6 rounded-md bg-rose-50 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm" title={entry.sapTransferId ? 'Devolver bloque SAP' : 'Devolver lote (recepcion)'}>
            <RotateCcw size={11} />
          </button>
          {canReturnToPending && (
            <button type="button" onClick={() => onReturnToPending(rec.id)} className="w-6 h-6 rounded-md bg-rose-50 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm" title="Regresar a Pendiente">
              <RefreshCw size={11} />
            </button>
          )}
          <button type="button" onClick={() => onShowTimeline(rec)} className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center text-[#2ec4f1] hover:bg-[#2ec4f1] hover:text-white transition-all shadow-sm" title="Ver Trazabilidad">
            <Clock size={11} />
          </button>
          <button type="button" onClick={() => onOpenHistoryModal(rec)} className="w-6 h-6 rounded-md bg-[var(--surface-hover)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-all" title="Ver Detalle">
            <Eye size={11} />
          </button>
          <button type="button" onClick={() => onOpenEditMeta(rec)} className="w-6 h-6 rounded-md bg-[var(--surface-hover)] flex items-center justify-center text-[var(--muted)] hover:text-amber-600 transition-all" title="Editar Metadatos">
            <Edit2 size={11} />
          </button>
          <button type="button" onClick={() => onPrintConduce(rec)} className="w-6 h-6 rounded-md bg-[var(--surface-hover)] flex items-center justify-center text-[var(--muted)] hover:text-blue-600 transition-all" title="Imprimir PDF">
            <Printer size={11} />
          </button>
        </div>
      </td>
    </tr>
  );
}

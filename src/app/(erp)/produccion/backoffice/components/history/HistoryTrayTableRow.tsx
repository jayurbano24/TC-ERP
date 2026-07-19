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
  const formattedDate = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()} ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
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

  const cell = 'px-2 py-2 text-[10px] font-medium text-[var(--foreground)] whitespace-nowrap';

  return (
    <tr className={`border-b border-[var(--border)] transition-colors hover:bg-[#2ec4f1]/10 ${bandBg}`}>
      <td className={cell}>{formattedDate}</td>
      <td className={cell}>{unitGuide}</td>
      <td className={`${cell} text-[var(--muted)] uppercase hidden xl:table-cell`}>{piloto}</td>
      <td className={`${cell} text-[var(--muted)] uppercase hidden xl:table-cell`}>{rec.carrier || '---'}</td>
      <td className={`${cell} text-[var(--muted)] hidden 2xl:table-cell`}>{classifierName}</td>
      <td className="px-2 py-2 whitespace-nowrap">
        <span
          className={`text-[8px] uppercase font-medium tracking-wide px-2 py-0.5 rounded-full ${
            entry.unitStatus === 'RECEPCIONADO_BODEGA_GENERAL'
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
              : entry.unitStatus === 'returned'
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                : 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
          }`}
        >
          {entry.unitStatusLabel}
        </span>
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        <Badge className="bg-[var(--surface-hover)] text-[var(--foreground)] border-none font-medium text-[9px] px-1.5 py-0.5">
          {osLabel}
        </Badge>
      </td>
      <td className="px-2 py-2 text-center whitespace-nowrap">
        <Badge
          className={`border-none font-medium text-[9px] px-1.5 py-0.5 ${reentry > 1 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-[var(--surface-hover)] text-[var(--muted)]'}`}
        >
          {reentry}°
        </Badge>
      </td>
      <td className={`${cell} uppercase`}>{formatAgencyLabel(entry.unitAgencyRaw, CAC_AGENCIES, rec.carrier)}</td>
      <td className={`${cell} text-[var(--muted)] uppercase`}>{techObj?.nombre || '---'}</td>
      <td className={`${cell} text-[var(--muted)] uppercase hidden 2xl:table-cell`}>{brandObj?.nombre || '---'}</td>
      <td className={cell}>{modelObj?.nombre || '---'}</td>
      <td className={`${cell} text-[var(--muted)] uppercase`}>{entry.unitSap}</td>
      <td className="px-2 py-2 whitespace-nowrap hidden xl:table-cell">
        <div className="flex flex-col gap-0.5 items-start">
          <SapValidationBadge status={unitSapValidationStatus} />
          <SeriesSapValidationDots statuses={seriesSapStatuses} />
        </div>
      </td>
      {[0, 1, 2, 3].map((si) => (
        <td key={si} className={cell}>
          {unit[si]?.serial_number ? (
            <span className="bg-[var(--surface-hover)] px-1.5 py-0.5 rounded text-[9px] tracking-wide text-[var(--foreground)]">
              {unit[si].serial_number}
            </span>
          ) : (
            <span className="text-[var(--muted)]">—</span>
          )}
        </td>
      ))}
      <td className="px-2 py-2 text-right whitespace-nowrap sticky right-0 bg-[var(--surface)] group-hover:bg-[var(--surface-hover)]">
        <div className="flex justify-end gap-0.5">
          <button type="button" onClick={() => onSapBlockReturn(entry)} className="w-6 h-6 rounded-md bg-rose-500/10 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all" title={entry.sapTransferId ? 'Devolver Bloque SAP' : 'Devolver lote (recepción)'}>
            <RotateCcw size={11} />
          </button>
          {canReturnToPending && (
            <button type="button" onClick={() => onReturnToPending(rec.id)} className="w-6 h-6 rounded-md bg-rose-500/10 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all" title="Regresar a Pendiente">
              <RefreshCw size={11} />
            </button>
          )}
          <button type="button" onClick={() => onShowTimeline(rec)} className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent)]/15 text-[var(--accent)] transition-all hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]" title="Ver Trazabilidad">
            <Clock size={11} />
          </button>
          <button type="button" onClick={() => onOpenHistoryModal(rec)} className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--surface-hover)] text-[var(--muted)] transition-all hover:text-[var(--foreground)]" title="Ver Detalle">
            <Eye size={11} />
          </button>
          <button type="button" onClick={() => onOpenEditMeta(rec)} className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--surface-hover)] text-[var(--muted)] transition-all hover:text-[var(--warning)]" title="Editar Metadatos">
            <Edit2 size={11} />
          </button>
          <button type="button" onClick={() => onPrintConduce(rec)} className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--surface-hover)] text-[var(--muted)] transition-all hover:text-[var(--accent)]" title="Imprimir PDF">
            <Printer size={11} />
          </button>
        </div>
      </td>
    </tr>
  );
}

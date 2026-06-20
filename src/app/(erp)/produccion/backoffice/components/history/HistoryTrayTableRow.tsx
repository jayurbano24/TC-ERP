'use client';

import { Badge } from '@/components/ui';
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
  const bandBg = rowIdx % 2 === 0 ? '' : 'bg-slate-50/50';
  const unitGuide = entry.unitGuide;
  const classifierName = getBackofficeClassifierName(rec, unitGuide);
  const modelObj = MASTER_MODELOS.find((m) => m.id === grp.modelId);
  const brandObj = MASTER_MARCAS.find((b) => b.id === grp.brandId);
  const techObj = modelObj ? MASTER_TECNOLOGIAS.find((t) => t.id === modelObj.tecnologiaId) : null;
  const reentry =
    unit.find((u: { service_orders?: { reentry_count?: number } }) => u?.service_orders?.reentry_count)
      ?.service_orders?.reentry_count || 1;

  return (
    <tr className={`border-b border-slate-100 transition-colors hover:bg-blue-50/30 ${bandBg}`}>
      <td className="px-4 py-3 text-[11px] font-bold text-[#181c3a] whitespace-nowrap">{formattedDate}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-[11px] font-black font-mono text-[#181c3a]">{unitGuide}</span>
      </td>
      <td className="px-4 py-3 text-[11px] font-black text-slate-500 uppercase whitespace-nowrap">{piloto}</td>
      <td className="px-4 py-3 text-[11px] text-slate-400 uppercase whitespace-nowrap">{rec.carrier || '---'}</td>
      <td className="px-4 py-3 text-[11px] text-slate-500 whitespace-nowrap">{classifierName}</td>
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
          className={`border-none font-black text-[10px] px-2 py-0.5 ${reentry > 1 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}
        >
          {reentry} Ingreso
        </Badge>
      </td>
      <td className="px-4 py-3 text-[11px] font-bold text-[#181c3a] uppercase whitespace-nowrap">
        {formatAgencyLabel(entry.unitAgencyRaw, CAC_AGENCIES, rec.carrier)}
      </td>
      <td className="px-4 py-3 text-[11px] font-black text-slate-500 uppercase whitespace-nowrap">{techObj?.nombre || '---'}</td>
      <td className="px-4 py-3 text-[11px] font-black text-slate-600 uppercase whitespace-nowrap">{brandObj?.nombre || '---'}</td>
      <td className="px-4 py-3 text-[11px] font-bold text-[#181c3a] whitespace-nowrap">{modelObj?.nombre || '---'}</td>
      <td className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase whitespace-nowrap">{entry.unitSap}</td>
      {[0, 1, 2, 3].map((si) => (
        <td key={si} className="px-4 py-3 text-[11px] font-mono font-bold text-slate-600 whitespace-nowrap">
          {unit[si]?.serial_number ? (
            <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] tracking-wide">{unit[si].serial_number}</span>
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
          <button type="button" onClick={() => onOpenHistoryModal(rec)} className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 hover:text-[#181c3a] transition-all" title="Ver Detalle">
            <Eye size={11} />
          </button>
          <button type="button" onClick={() => onOpenEditMeta(rec)} className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 hover:text-amber-500 transition-all" title="Editar Metadatos">
            <Edit2 size={11} />
          </button>
          <button type="button" onClick={() => onPrintConduce(rec)} className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 hover:text-blue-500 transition-all" title="Imprimir PDF">
            <Printer size={11} />
          </button>
        </div>
      </td>
    </tr>
  );
}

'use client';

import React from 'react';
import { Button, notify, confirmDialog, promptDialog } from '@/components/ui';
import { Edit3, Plus, Table, Trash2, X } from 'lucide-react';
import type { OperationContext } from '../../operation/operationContext';
import type { GuideItem } from '../../types';
import {
  previewEquipmentReentry,
  formatIngresoLabel,
} from '@/modules/recepcion/client/receptions';

type Props = { ctx: OperationContext };

async function attachUnitReentry(target: GuideItem, unitIdx: number) {
  const unit = target.series[unitIdx];
  if (!unit || unit.length < target.seriesPerUnit) return;
  try {
    const count = await previewEquipmentReentry(unit);
    const counts = [...(target.unitReentryCounts || [])];
    while (counts.length < target.series.length) counts.push(1);
    counts[unitIdx] = count;
    target.unitReentryCounts = counts;
    if (count > 1) {
      notify.info(`${formatIngresoLabel(count)} detectado (CAC)`, {
        description: `La serie ${unit[0]} ya estuvo en el sistema y vuelve a ingresar.`,
      });
    }
  } catch {
    /* preview opcional */
  }
}

function addSerialToItem(
  item: GuideItem,
  sn: string
): { ok: true; unitIdx: number; completed: boolean } | { ok: false; reason: string } {
  if (item.series.flat().includes(sn)) {
    return { ok: false, reason: 'Serie ya existe' };
  }

  let lastUnit = item.series.length > 0 ? item.series[item.series.length - 1] : null;
  let unitIdx: number;
  let completed = false;

  if (lastUnit && lastUnit.length < item.seriesPerUnit) {
    lastUnit.push(sn);
    unitIdx = item.series.length - 1;
    completed = lastUnit.length >= item.seriesPerUnit;
  } else {
    if (item.series.length >= item.cantidad) {
      return { ok: false, reason: 'Límite de unidades alcanzado' };
    }
    item.series.push([sn]);
    unitIdx = item.series.length - 1;
    completed = item.seriesPerUnit <= 1;
    const counts = [...(item.unitReentryCounts || [])];
    counts.push(1);
    item.unitReentryCounts = counts;
  }

  item.scannedCount = item.series.length;
  return { ok: true, unitIdx, completed };
}

export function ConfigSeriesScanPanel({ ctx }: Props) {
  const {
    guideItems,
    setGuideItems,
    selectedItemIdx,
    itemSeriesInputs,
    setItemSeriesInputs,
    MASTER_TECNOLOGIAS,
    MASTER_MARCAS,
    MASTER_MODELOS,
    setBulkTargetIdx,
    setShowBulkModal,
  } = ctx;

  const handleAddSerial = async (idx: number, raw: string) => {
    const sn = raw.trim().toUpperCase();
    if (!sn) return;

    const newItems = [...guideItems];
    const target = { ...newItems[idx], series: newItems[idx].series.map((u) => [...u]) };
    if (newItems[idx].unitReentryCounts) {
      target.unitReentryCounts = [...newItems[idx].unitReentryCounts!];
    }

    const result = addSerialToItem(target, sn);
    if (!result.ok) {
      notify.warning(result.reason);
      return;
    }

    newItems[idx] = target;
    setGuideItems(newItems);
    setItemSeriesInputs({ ...itemSeriesInputs, [idx]: '' });

    if (result.completed) {
      await attachUnitReentry(target, result.unitIdx);
      newItems[idx] = { ...target };
      setGuideItems([...newItems]);
    }
  };

  return (
    <>
      {selectedItemIdx !== null && guideItems[selectedItemIdx] && (() => {
        const item = guideItems[selectedItemIdx];
        const idx = selectedItemIdx;
        const techName = MASTER_TECNOLOGIAS.find((t) => t.id === item.tipo)?.nombre || '';
        const marcaName = MASTER_MARCAS.find((m) => m.id === item.marca)?.nombre || '';
        const modeloName = MASTER_MODELOS.find((m) => m.id === item.modelo)?.nombre || '';
        const totalSeries = item.series.flat().length;
        const expectedSeries = item.cantidad * item.seriesPerUnit;

        return (
          <div className="bg-slate-50 rounded-[2rem] p-8 border-2 border-[#2ec4f1]/20 animate-rise-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <p className="text-[9px] font-black text-[#2ec4f1] uppercase tracking-widest mb-1">
                  {techName} • {marcaName}
                </p>
                <h4 className="text-lg font-black text-[#181c3a] uppercase">{modeloName}</h4>
                <p className="text-[9px] font-black text-slate-400 uppercase mt-1">
                  {item.seriesPerUnit} series/unidad —{' '}
                  <span className="text-emerald-500">
                    {totalSeries}/{expectedSeries} series totales
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBulkTargetIdx(idx);
                    setShowBulkModal(true);
                  }}
                  className="border-slate-200 text-[9px] font-black uppercase text-[#2ec4f1] hover:bg-blue-50"
                >
                  <Table size={12} className="mr-1.5" /> Carga Masiva
                </Button>
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoFocus
                    placeholder={`Pistolear ${
                      item.series.length > 0 &&
                      item.series[item.series.length - 1].length < item.seriesPerUnit
                        ? 'Serie ' +
                          (item.series[item.series.length - 1].length + 1) +
                          ' / Unidad ' +
                          item.series.length
                        : 'Serie 1 / Unidad ' + (item.series.length + 1)
                    }...`}
                    className="bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-xs font-mono font-bold outline-none focus:border-[#2ec4f1] w-64 transition-all"
                    value={itemSeriesInputs[idx] || ''}
                    onChange={(e) =>
                      setItemSeriesInputs({ ...itemSeriesInputs, [idx]: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void handleAddSerial(idx, itemSeriesInputs[idx] || '');
                      }
                    }}
                  />
                  <Button
                    variant="secondary"
                    className="h-12 w-12 p-0 rounded-xl bg-[#181c3a] text-white hover:bg-[#2ec4f1]"
                    onClick={() => void handleAddSerial(idx, itemSeriesInputs[idx] || '')}
                  >
                    <Plus size={16} />
                  </Button>
                </div>
              </div>
            </div>

            {item.series.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left min-w-[640px]">
                  <thead>
                    <tr className="bg-[#181c3a] text-white">
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest whitespace-nowrap">
                        Unidad
                      </th>
                      {Array.from({ length: item.seriesPerUnit }, (_, i) => (
                        <th
                          key={i}
                          className="px-4 py-3 text-[9px] font-black uppercase tracking-widest whitespace-nowrap"
                        >
                          S{i + 1}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest whitespace-nowrap text-center">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest whitespace-nowrap text-right">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {item.series.map((unit, uIdx) => {
                      const isComplete = unit.length >= item.seriesPerUnit;
                      const reentry = item.unitReentryCounts?.[uIdx] || 1;
                      return (
                        <tr
                          key={uIdx}
                          className={`group/unit transition-colors hover:bg-slate-50/80 ${
                            isComplete ? '' : 'bg-amber-50/30'
                          }`}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-[10px] font-black text-[#181c3a] uppercase">
                              Unidad {uIdx + 1}
                            </span>
                          </td>
                          {Array.from({ length: item.seriesPerUnit }, (_, sIdx) => {
                            const sn = unit[sIdx];
                            return (
                              <td key={sIdx} className="px-4 py-3 whitespace-nowrap">
                                {sn ? (
                                  <div className="flex items-center gap-2 group/sn">
                                    <span className="text-[8px] font-black text-slate-400 shrink-0">
                                      S{sIdx + 1}-
                                    </span>
                                    <span
                                      className="text-[10px] font-mono font-bold text-[#181c3a] max-w-[140px] truncate"
                                      title={sn}
                                    >
                                      {sn}
                                    </span>
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover/sn:opacity-100 transition-all shrink-0">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const currentSN = unit[sIdx];
                                          const newSN = await promptDialog({
                                            title: 'Editar número de serie',
                                            prompt: { defaultValue: currentSN },
                                          });
                                          if (newSN !== null && newSN.trim() !== '') {
                                            const newItems = [...guideItems];
                                            newItems[idx].series[uIdx][sIdx] = newSN
                                              .trim()
                                              .toUpperCase();
                                            setGuideItems(newItems);
                                          }
                                        }}
                                        className="p-1 text-slate-400 hover:text-[#2ec4f1]"
                                        title="Editar serie"
                                      >
                                        <Edit3 size={10} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          if (
                                            await confirmDialog({
                                              title: 'Eliminar serie',
                                              message: '¿Eliminar esta serie?',
                                              tone: 'error',
                                              confirmText: 'Eliminar',
                                            })
                                          ) {
                                            const newItems = [...guideItems];
                                            newItems[idx].series[uIdx].splice(sIdx, 1);
                                            if (newItems[idx].series[uIdx].length === 0) {
                                              newItems[idx].series.splice(uIdx, 1);
                                              newItems[idx].unitReentryCounts?.splice(uIdx, 1);
                                            }
                                            newItems[idx].scannedCount =
                                              newItems[idx].series.length;
                                            setGuideItems(newItems);
                                          }
                                        }}
                                        className="p-1 text-slate-400 hover:text-rose-500"
                                        title="Eliminar serie"
                                      >
                                        <X size={10} />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[9px] font-bold text-slate-300 uppercase">
                                    S{sIdx + 1}- —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {isComplete ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-[8px] font-black uppercase text-emerald-600 tracking-widest">
                                  ✓ Completa
                                </span>
                                {reentry > 1 ? (
                                  <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                    {formatIngresoLabel(reentry)}
                                  </span>
                                ) : (
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                                    1° Ingreso
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[8px] font-black uppercase text-amber-600 tracking-widest">
                                {unit.length}/{item.seriesPerUnit}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                const newItems = [...guideItems];
                                newItems[idx].series.splice(uIdx, 1);
                                newItems[idx].unitReentryCounts?.splice(uIdx, 1);
                                newItems[idx].scannedCount = newItems[idx].series.length;
                                setGuideItems(newItems);
                              }}
                              className="p-1.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover/unit:opacity-100 transition-all"
                              title="Eliminar unidad"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[10px] italic text-slate-300 text-center py-6">
                Escanee la primera serie para comenzar...
              </p>
            )}
          </div>
        );
      })()}
    </>
  );
}

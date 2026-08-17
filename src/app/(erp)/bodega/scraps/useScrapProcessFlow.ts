'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { notify } from '@/components/ui';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { sapValidationReader } from '@/modules/sap-integration';
import {
  dispatchBoxFromWarehouse,
  dispatchSpecificSeries,
  expandSelectedSeriesForOs,
  transferBoxesToArea,
  transferBoxesToAreaInBatches,
  transferSpecificSeriesToArea,
} from '@/modules/inventario/client/warehouseBoxes';
import { isHexagonalOutboundDispatchEnabled } from '@/modules/outbound-dispatch';
import { loadScrapBoxSeries } from './ScrapBoxDetailDrawer';
import type { ScrapBoxRow } from './ScrapBoxDetailDrawer';

type DispatchBoxState = ScrapBoxRow & {
  series: unknown[];
  unitCount: number;
  tecnologia?: string;
  area?: string;
  cantidad?: number;
  box_code?: string;
};

export function useScrapProcessFlow(opts: {
  inventory: ScrapBoxRow[];
  onSuccess: () => void | Promise<void>;
}) {
  const { inventory, onSuccess } = opts;
  const useOutboundDispatchHex = isHexagonalOutboundDispatchEnabled();

  const [showDispatchModal, setShowDispatchModal] = useState<DispatchBoxState | null>(null);
  const [loadingDispatchSeries, setLoadingDispatchSeries] = useState(false);
  const [dispatchDestination, setDispatchDestination] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchMode, setDispatchMode] = useState<'all' | 'specific'>('all');
  const [dispatchAction, setDispatchAction] = useState<'despacho' | 'traslado'>('despacho');
  const [dispatchArea, setDispatchArea] = useState('Bodega Central');
  const [selectedSeriesForDispatch, setSelectedSeriesForDispatch] = useState<string[]>([]);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedBoxesForTransfer, setSelectedBoxesForTransfer] = useState<string[]>([]);
  const [transferScanInput, setTransferScanInput] = useState('');
  const [destinationArea, setDestinationArea] = useState('Bodega Central');
  const [transferExecuting, setTransferExecuting] = useState(false);

  const resetDispatch = useCallback(() => {
    setShowDispatchModal(null);
    setDispatchDestination('');
    setDispatchNotes('');
    setSelectedSeriesForDispatch([]);
    setDispatchAction('despacho');
    setDispatchMode('all');
  }, []);

  const openDispatchFlow = useCallback(
    async (item: ScrapBoxRow, initialAction: 'despacho' | 'traslado' = 'despacho') => {
      setDispatchMode('all');
      setDispatchAction(initialAction);
      setSelectedSeriesForDispatch([]);
      setShowDispatchModal({
        ...item,
        series: [],
        unitCount: item.unitCount,
        tecnologia: item.techName,
        area: 'Bodega SCRAP',
        cantidad: item.capacity,
        box_code: item.id,
      });
      setDispatchDestination('Calculando...');
      setLoadingDispatchSeries(true);

      try {
        const series = await loadScrapBoxSeries(item.realDbId);
        const equipos = series.length
          ? new Set(series.map((s) => s.ordenServicio || s.s1 || '')).size
          : Number(item.unitCount || 0);

        setShowDispatchModal({
          ...item,
          series,
          unitCount: equipos || Number(item.unitCount || 0),
          tecnologia: item.techName,
          area: 'Bodega SCRAP',
          cantidad: item.capacity,
          box_code: item.id,
        });

        if (series.length === 0 && Number(item.unitCount || 0) > 0) {
          notify.warning('Series no cargadas', {
            description:
              'El conteo de la caja existe pero no se leyeron series. Prueba «Toda la caja» o reabre el modal.',
          });
        }

        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          const { data } = await supabase
            .from('dispatches')
            .select('guide_number')
            .like('guide_number', 'TC-SCRAPS-%');

          let nextId = 100;
          if (data && data.length > 0) {
            let max = 99;
            data.forEach((d: { guide_number: string }) => {
              const num = parseInt(String(d.guide_number).replace(/^TC-SCRAPS-/i, ''), 10);
              if (!Number.isNaN(num) && num > max) max = num;
            });
            nextId = max + 1;
          }
          setDispatchDestination(`TC-SCRAPS-${String(nextId).padStart(3, '0')}`);
        } else {
          setDispatchDestination('TC-SCRAPS-100');
        }
      } catch (err) {
        console.error(err);
        notify.error('No se pudieron cargar las series para despacho');
        setShowDispatchModal(null);
      } finally {
        setLoadingDispatchSeries(false);
      }
    },
    []
  );

  const openTransferFlow = useCallback((item?: ScrapBoxRow) => {
    setSelectedBoxesForTransfer(item ? [item.id] : []);
    setTransferScanInput('');
    setDestinationArea('Bodega Central');
    setShowTransferModal(true);
  }, []);

  const handleDispatchBox = useCallback(
    async (boxId: string, realDbId?: string) => {
      if (dispatchAction === 'despacho' && !dispatchDestination.trim()) {
        notify.warning('Por favor ingresa un destino o guía de salida.');
        return;
      }
      if (dispatchMode === 'specific' && selectedSeriesForDispatch.length === 0) {
        notify.warning('Debes seleccionar al menos una serie para procesar.');
        return;
      }

      const resolvedDbId = realDbId || boxId;
      let box =
        showDispatchModal?.realDbId === resolvedDbId || showDispatchModal?.id === boxId
          ? showDispatchModal
          : null;

      let seriesToCheck: any[] = box?.series?.length ? [...(box.series as any[])] : [];
      if (!seriesToCheck.length && resolvedDbId) {
        try {
          seriesToCheck = await loadScrapBoxSeries(resolvedDbId);
        } catch {
          notify.error('No se pudieron validar las series antes del movimiento');
          return;
        }
      }

      if (dispatchMode === 'specific') {
        seriesToCheck = seriesToCheck.filter(
          (s: any) =>
            selectedSeriesForDispatch.includes(s.sn) ||
            selectedSeriesForDispatch.includes(s.s1) ||
            selectedSeriesForDispatch.includes(s.serial_number)
        );
      }

      for (const s of seriesToCheck) {
        const sapInput = {
          integrationStatus: s.sap_integration_status || s.sap_status,
          seriesStatuses: s.series_sap_statuses || [s.sap_status],
        };
        if (dispatchAction === 'despacho') {
          const decision = sapValidationReader.authorize(sapInput, 'dispatch');
          if (!decision.allowed) {
            notify.warning(`${decision.reason} Equipo ${s.sn || s.s1 || s.serial_number}.`);
            return;
          }
        } else if (dispatchAction === 'traslado') {
          if (dispatchArea !== 'Diagnóstico' && dispatchArea !== 'Reparación') {
            const decision = sapValidationReader.authorize(sapInput, 'transfer');
            if (!decision.allowed) {
              notify.warning(`${decision.reason} Equipo ${s.sn || s.s1 || s.serial_number}.`);
              return;
            }
          }
        }
      }

      setIsDispatching(true);
      try {
        let guideForDispatch = dispatchDestination.trim();
        if (dispatchAction === 'despacho') {
          const supabase = getSupabaseBrowserClient();
          if (supabase) {
            const { data: rpcCode, error: rpcErr } = await supabase.rpc('next_scrap_salida_code');
            if (!rpcErr && rpcCode) {
              guideForDispatch = String(rpcCode);
              setDispatchDestination(guideForDispatch);
            }
          }
        }

        let error: string | null | undefined;
        if (dispatchAction === 'traslado') {
          if (dispatchMode === 'all') {
            const res = await transferBoxesToArea([resolvedDbId], dispatchArea, undefined);
            error = res.error ? String(res.error) : null;
          } else {
            const expanded = expandSelectedSeriesForOs(seriesToCheck, selectedSeriesForDispatch);
            const res = await transferSpecificSeriesToArea(
              resolvedDbId,
              expanded,
              dispatchArea,
              'Admin User'
            );
            error = res.error ? String(res.error) : null;
          }
        } else if (dispatchMode === 'all') {
          const res = await dispatchBoxFromWarehouse(
            resolvedDbId,
            guideForDispatch,
            dispatchNotes
          );
          error = res.error ? String(res.error) : null;
        } else {
          const expanded = expandSelectedSeriesForOs(seriesToCheck, selectedSeriesForDispatch);
          const res = await dispatchSpecificSeries(
            resolvedDbId,
            expanded,
            guideForDispatch,
            dispatchNotes
          );
          error = res.error ? String(res.error) : null;
          if (!error && res.data?.equipos_remaining != null) {
            notify.success('Despacho registrado', {
              description: `Conduce ${guideForDispatch}. Equipos restantes en caja: ${res.data.equipos_remaining}.`,
            });
          }
        }

        if (error) {
          notify.error('Error al procesar', { description: error });
        } else {
          if (dispatchAction !== 'despacho' || dispatchMode === 'all') {
            notify.success(
              dispatchAction === 'despacho' ? 'Despacho registrado' : 'Traslado registrado'
            );
          }
          resetDispatch();
          await onSuccess();
        }
      } catch (err) {
        console.error(err);
        notify.error('Error inesperado al procesar la caja.');
      } finally {
        setIsDispatching(false);
      }
    },
    [
      dispatchAction,
      dispatchArea,
      dispatchDestination,
      dispatchMode,
      dispatchNotes,
      onSuccess,
      resetDispatch,
      selectedSeriesForDispatch,
      showDispatchModal,
    ]
  );

  const handleScanForTransfer = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!transferScanInput) return;
      const scan = transferScanInput.trim().toUpperCase();
      const box = inventory.find((b) => {
        const id = b.id.toUpperCase();
        const display = b.displayId.toUpperCase();
        return id === scan || display === scan || display.replace(/^TCW-/, '') === scan;
      });
      if (!box) {
        notify.warning('Caja no encontrada en Bodega SCRAPS');
        setTransferScanInput('');
        return;
      }
      if (!selectedBoxesForTransfer.includes(box.id)) {
        setSelectedBoxesForTransfer([...selectedBoxesForTransfer, box.id]);
      }
      setTransferScanInput('');
    },
    [inventory, selectedBoxesForTransfer, transferScanInput]
  );

  const handleExecuteTransfer = useCallback(async () => {
    if (selectedBoxesForTransfer.length === 0 || transferExecuting) return;
    setTransferExecuting(true);
    try {
      const realBoxIds = selectedBoxesForTransfer.map((id) => {
        const box = inventory.find((b) => b.id === id);
        return box ? box.realDbId || box.id : id;
      });
      const result = await transferBoxesToAreaInBatches(realBoxIds, destinationArea, undefined);
      if (!result.success) {
        notify.error('Error en la transferencia', {
          description: result.error ?? 'Transferencia fallida',
        });
      } else {
        setShowTransferModal(false);
        setSelectedBoxesForTransfer([]);
        const batchNote = result.batches > 1 ? ` en ${result.batches} lotes automáticos` : '';
        notify.success('Transferencia exitosa', {
          description: `${result.transferred} cajas movidas a ${destinationArea}${batchNote}.`,
        });
        await onSuccess();
      }
    } catch (err) {
      console.error(err);
      notify.error('Error inesperado en transferencia');
    } finally {
      setTransferExecuting(false);
    }
  }, [
    destinationArea,
    inventory,
    onSuccess,
    selectedBoxesForTransfer,
    transferExecuting,
  ]);

  const transferInventory = inventory.map((b) => ({
    ...b,
    area: 'Bodega SCRAP',
    box_code: b.id,
    rack_location: b.rack,
    marcaLabel: b.marcaLabel,
    modeloLabel: b.modeloLabel,
  }));

  return {
    useOutboundDispatchHex,
    showDispatchModal,
    loadingDispatchSeries,
    dispatchDestination,
    setDispatchDestination,
    dispatchNotes,
    setDispatchNotes,
    isDispatching,
    dispatchMode,
    setDispatchMode,
    dispatchAction,
    setDispatchAction,
    dispatchArea,
    setDispatchArea,
    selectedSeriesForDispatch,
    setSelectedSeriesForDispatch,
    openDispatchFlow,
    handleDispatchBox,
    resetDispatch,
    showTransferModal,
    setShowTransferModal,
    selectedBoxesForTransfer,
    setSelectedBoxesForTransfer,
    transferScanInput,
    setTransferScanInput,
    destinationArea,
    setDestinationArea,
    transferExecuting,
    openTransferFlow,
    handleScanForTransfer,
    handleExecuteTransfer,
    transferInventory,
  };
}

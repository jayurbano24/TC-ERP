'use client';

import { useCallback, useMemo, useState } from 'react';
import { notify } from '@/components/ui/messaging/messageStore';
import { apiFetch, isAuthErrorMessage, readApiJson, haltForLoginRedirect } from '@/lib/http/apiFetch';
import type { MassTransferForm } from '../../components/modals/MassTransferModal';
import type { CatalogBrand, CatalogModel } from '../../types';

type EligibleSeries = { allIds: string[]; sn: string };

type Params = {
  MASTER_MARCAS: CatalogBrand[];
  MASTER_MODELOS: CatalogModel[];
  historyReceptions: unknown[];
  fetchHistory: (opts?: { silent?: boolean }) => Promise<void>;
  resolveSeriesPerUnit: (modelId: string) => number;
};

export function useMassTransferModal({
  MASTER_MARCAS,
  MASTER_MODELOS,
  historyReceptions,
  fetchHistory,
  resolveSeriesPerUnit,
}: Params) {
  const [showMassTransferModal, setShowMassTransferModal] = useState(false);
  const [massTransferData, setMassTransferData] = useState<MassTransferForm>({
    techId: '',
    brandId: '',
    modelId: '',
    quantity: '',
  });
  const [massTransferLoading, setMassTransferLoading] = useState(false);
  const [isScanningForTransfer, setIsScanningForTransfer] = useState(false);
  const [scannedTransferSeries, setScannedTransferSeries] = useState<string[]>([]);
  const [currentScanInput, setCurrentScanInput] = useState('');
  const [eligibleSeriesIdsList, setEligibleSeriesIdsList] = useState<EligibleSeries[]>([]);

  const massTransferBrands = useMemo(
    () =>
      !massTransferData.techId
        ? []
        : MASTER_MARCAS.filter((b) =>
            MASTER_MODELOS.some(
              (m) => m.marcaId === b.id && m.tecnologiaId === massTransferData.techId
            )
          ),
    [MASTER_MARCAS, MASTER_MODELOS, massTransferData.techId]
  );

  const handlePrepareMassTransfer = useCallback(async () => {
    if (
      !massTransferData.techId ||
      !massTransferData.brandId ||
      !massTransferData.modelId ||
      !massTransferData.quantity
    ) {
      notify.warning('Por favor completa todos los campos.');
      return;
    }

    try {
      const params = new URLSearchParams({
        techId: massTransferData.techId,
        brandId: massTransferData.brandId,
        modelId: massTransferData.modelId,
      });
      const res = await apiFetch(`/api/backoffice/cac-history/transfer-eligible?${params}`, {
        cache: 'no-store',
      });
      const payload = await readApiJson<{ items?: Array<{ seriesIds: string[]; sn: string }> }>(res);

      const eligibleSeriesList = (payload.items || []).map((item) => ({
        allIds: item.seriesIds,
        sn: item.sn,
      }));

      if (eligibleSeriesList.length < Number(massTransferData.quantity)) {
        notify.warning('Equipos insuficientes', {
          description: `No hay suficientes equipos disponibles en la selección. Disponibles: ${eligibleSeriesList.length}`,
        });
        return;
      }

      setEligibleSeriesIdsList(eligibleSeriesList);
      setScannedTransferSeries([]);
      setCurrentScanInput('');
      setIsScanningForTransfer(true);
      setShowMassTransferModal(false);
    } catch (err) {
      if (isAuthErrorMessage(err)) {
        void haltForLoginRedirect();
        return;
      }
      console.warn(err);
      notify.error(err instanceof Error ? err.message : 'Error al preparar traslado.');
    }
  }, [massTransferData]);

  const handleScanKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && currentScanInput.trim()) {
        e.preventDefault();
        if (scannedTransferSeries.length >= Number(massTransferData.quantity)) {
          notify.warning('Ya has alcanzado la cantidad solicitada a trasladar.');
          return;
        }
        const sn = currentScanInput.trim();
        if (scannedTransferSeries.includes(sn)) {
          notify.warning('Esta serie ya fue escaneada para traslado.');
          setCurrentScanInput('');
          return;
        }
        const isEligible = eligibleSeriesIdsList.find((s) => s.sn === sn);
        if (!isEligible) {
          notify.warning('Serie no válida', {
            description: 'La serie ingresada NO corresponde a la tecnología, marca y modelo seleccionados, o no está disponible en la bandeja.',
          });
          setCurrentScanInput('');
          return;
        }
        setScannedTransferSeries((prev) => [...prev, sn]);
        setCurrentScanInput('');
      }
    },
    [currentScanInput, eligibleSeriesIdsList, massTransferData.quantity, scannedTransferSeries.length]
  );

  const handleConfirmMassTransfer = useCallback(async () => {
    if (scannedTransferSeries.length !== Number(massTransferData.quantity)) {
      notify.warning(`Debe escanear exactamente ${massTransferData.quantity} series.`);
      return;
    }
    setMassTransferLoading(true);
    try {
      const seriesToTransfer = scannedTransferSeries.flatMap((sn) => {
        const match = eligibleSeriesIdsList.find((s) => s.sn === sn);
        return match?.allIds ?? [];
      });
      const { transferMassiveToWorkshop } = await import('@/lib/database/workshop');
      const result = await transferMassiveToWorkshop(seriesToTransfer);
      if (result.error) throw new Error(result.error);
      notify.success(`Se trasladaron ${seriesToTransfer.length} equipos al Taller.`);
      setIsScanningForTransfer(false);
      setScannedTransferSeries([]);
      setMassTransferData({ techId: '', brandId: '', modelId: '', quantity: '' });
      await fetchHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error('Error en el traslado', { description: message });
    }
    setMassTransferLoading(false);
  }, [eligibleSeriesIdsList, fetchHistory, massTransferData.quantity, scannedTransferSeries]);

  return {
    showMassTransferModal,
    setShowMassTransferModal,
    massTransferData,
    onMassTransferDataChange: (patch: Partial<MassTransferForm>) =>
      setMassTransferData((prev) => ({ ...prev, ...patch })),
    massTransferBrands,
    handlePrepareMassTransfer,
    onCloseMassTransferModal: () => setShowMassTransferModal(false),
    onOpenMassTransfer: () => setShowMassTransferModal(true),
    isScanningForTransfer,
    scannedTransferSeries,
    currentScanInput,
    massTransferLoading,
    onScanInputChange: setCurrentScanInput,
    handleScanKeyDown,
    handleConfirmMassTransfer,
    onCloseScanModal: () => setIsScanningForTransfer(false),
  };
}

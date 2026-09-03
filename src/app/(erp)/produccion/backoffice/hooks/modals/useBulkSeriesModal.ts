'use client';

import { useCallback, useState } from 'react';
import type React from 'react';
import { notify } from '@/components/ui';
import type { GuideItem, CatalogModel } from '../../types';
import {
  prepareScannedSerial,
  validateSerialForModelSlot,
} from '@/shared/validation/serialDigitRules';

type Params = {
  guideItems: GuideItem[];
  setGuideItems: React.Dispatch<React.SetStateAction<GuideItem[]>>;
  MASTER_MODELOS?: CatalogModel[];
};

export function useBulkSeriesModal({ guideItems, setGuideItems, MASTER_MODELOS = [] }: Params) {
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkTargetIdx, setBulkTargetIdx] = useState<number | null>(null);

  const handleBulkImport = useCallback(() => {
    if (bulkTargetIdx === null) return;
    const lines = bulkText
      .split('\n')
      .flatMap((l) => l.split(','))
      .flatMap((l) => l.split('\t'))
      .flatMap((l) => l.split(' '))
      .map((s) => prepareScannedSerial(s))
      .filter((s) => s !== '');

    const targetItem = { ...guideItems[bulkTargetIdx] };
    const seriesPerUnit = targetItem.seriesPerUnit;
    const model = MASTER_MODELOS.find((m) => m.id === targetItem.modelo);
    const newSeries = [...targetItem.series];
    let currentUnit =
      newSeries.length > 0 && newSeries[newSeries.length - 1].length < seriesPerUnit
        ? newSeries.pop()!
        : [];
    let skippedDigits = 0;

    for (const sn of lines) {
      if (targetItem.scannedCount >= targetItem.cantidad && currentUnit.length === 0) break;
      const flatSeries = newSeries.flat().concat(currentUnit);
      if (flatSeries.includes(sn)) continue;
      const slotIdx = currentUnit.length;
      const check = validateSerialForModelSlot(sn, model, slotIdx);
      if (!check.valid) {
        skippedDigits += 1;
        continue;
      }
      currentUnit.push(check.serial);
      if (currentUnit.length === seriesPerUnit) {
        newSeries.push(currentUnit);
        targetItem.scannedCount = newSeries.length;
        currentUnit = [];
      }
    }

    if (currentUnit.length > 0) {
      newSeries.push(currentUnit);
      targetItem.scannedCount = newSeries.length;
    }

    if (skippedDigits > 0) {
      notify.warning(`${skippedDigits} serie(s) omitida(s)`, {
        description: 'No cumplían la cantidad de caracteres de la regla del modelo.',
      });
    }

    setGuideItems((prev) => {
      const next = [...prev];
      next[bulkTargetIdx] = { ...targetItem, series: newSeries };
      return next;
    });
    setShowBulkModal(false);
    setBulkText('');
  }, [bulkTargetIdx, bulkText, guideItems, setGuideItems, MASTER_MODELOS]);

  return {
    showBulkModal,
    setShowBulkModal,
    bulkText,
    setBulkText,
    bulkTargetIdx,
    setBulkTargetIdx,
    handleBulkImport,
    onCloseBulkModal: () => setShowBulkModal(false),
  };
}

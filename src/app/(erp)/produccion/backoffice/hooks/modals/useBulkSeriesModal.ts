'use client';

import { useCallback, useState } from 'react';
import type React from 'react';
import type { GuideItem } from '../../types';

type Params = {
  guideItems: GuideItem[];
  setGuideItems: React.Dispatch<React.SetStateAction<GuideItem[]>>;
};

export function useBulkSeriesModal({ guideItems, setGuideItems }: Params) {
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
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s !== '');

    const targetItem = { ...guideItems[bulkTargetIdx] };
    const seriesPerUnit = targetItem.seriesPerUnit;
    const newSeries = [...targetItem.series];
    let currentUnit =
      newSeries.length > 0 && newSeries[newSeries.length - 1].length < seriesPerUnit
        ? newSeries.pop()!
        : [];

    for (const sn of lines) {
      if (targetItem.scannedCount >= targetItem.cantidad && currentUnit.length === 0) break;
      const flatSeries = newSeries.flat().concat(currentUnit);
      if (flatSeries.includes(sn)) continue;
      currentUnit.push(sn);
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

    setGuideItems((prev) => {
      const next = [...prev];
      next[bulkTargetIdx] = { ...targetItem, series: newSeries };
      return next;
    });
    setShowBulkModal(false);
    setBulkText('');
  }, [bulkTargetIdx, bulkText, guideItems, setGuideItems]);

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

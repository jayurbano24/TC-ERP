'use client';

import { useCallback, useState } from 'react';
import {
  getReceptionTimelineSource,
  getSeriesByReceptionId,
} from '@/modules/recepcion/client/receptions';

type Params = {
  historyReceptions: unknown[];
};

export function useHistoryDetailModals({ historyReceptions }: Params) {
  const [selectedHistoryReception, setSelectedHistoryReception] = useState<Record<string, unknown> | null>(
    null
  );
  const [historyModalSeries, setHistoryModalSeries] = useState<unknown[]>([]);
  const [showTimeline, setShowTimeline] = useState<Record<string, unknown> | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineActiveGuide, setTimelineActiveGuide] = useState<string | null>(null);
  const [selectedReception, setSelectedReception] = useState<Record<string, unknown> | null>(null);
  const [selectedReceptionSeries, setSelectedReceptionSeries] = useState<unknown[]>([]);
  const [isLoadingSeries, setIsLoadingSeries] = useState(false);

  const handleOpenHistoryModal = useCallback(
    async (rec: Record<string, unknown>) => {
      setSelectedHistoryReception(rec);
      setHistoryModalSeries([]);
      try {
        const preLoaded = (historyReceptions as { id?: unknown; series?: unknown[] }[]).find(
          (r) => r.id === rec.id
        );
        if (preLoaded?.series?.length) {
          setHistoryModalSeries(preLoaded.series);
        } else {
          const data = await getSeriesByReceptionId(String(rec.id));
          setHistoryModalSeries(data);
        }
      } catch (err) {
        console.error(err);
      }
    },
    [historyReceptions]
  );

  const handleViewReception = useCallback(async (r: Record<string, unknown>) => {
    setSelectedReception(r);
    setIsLoadingSeries(true);
    try {
      const series = await getSeriesByReceptionId(String(r.id));
      setSelectedReceptionSeries(series || []);
    } catch (err) {
      console.error(err);
      setSelectedReceptionSeries([]);
    }
    setIsLoadingSeries(false);
  }, []);

  const onShowTimeline = useCallback(async (rec: Record<string, unknown>) => {
    const unitGuide = typeof rec.unitGuide === 'string' ? rec.unitGuide : null;
    const stubStatus = typeof rec.unitStatus === 'string' ? rec.unitStatus : rec.status;
    setTimelineActiveGuide(unitGuide);
    setShowTimeline({
      ...rec,
      guide_number: unitGuide || rec.guide_number,
      status: stubStatus,
    });
    setTimelineLoading(true);
    try {
      const full = await getReceptionTimelineSource(String(rec.id));
      if (!full) return;
      setShowTimeline((prev) => ({
        ...(prev || rec),
        ...full,
        // Preferir guía de la fila del tray si viene filtrada por unidad
        guide_number: unitGuide || full.guide_number || rec.guide_number,
        status: full.status || stubStatus,
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  return {
    selectedHistoryReception,
    historyModalSeries,
    handleOpenHistoryModal,
    onCloseHistoryDetail: () => setSelectedHistoryReception(null),
    onPrintHistoryDetail: () => window.print(),
    showTimeline,
    timelineLoading,
    timelineActiveGuide,
    onShowTimeline,
    onTimelineActiveGuideChange: setTimelineActiveGuide,
    onCloseTimeline: () => {
      setShowTimeline(null);
      setTimelineLoading(false);
      setTimelineActiveGuide(null);
    },
    selectedReception,
    selectedReceptionSeries,
    isLoadingSeries,
    handleViewReception,
    onCloseReceptionDrawer: () => setSelectedReception(null),
  };
}

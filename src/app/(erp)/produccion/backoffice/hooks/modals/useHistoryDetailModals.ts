'use client';

import { useCallback, useState } from 'react';
import { getSeriesByReceptionId } from '@/modules/recepcion/client/receptions';

type Params = {
  historyReceptions: unknown[];
};

export function useHistoryDetailModals({ historyReceptions }: Params) {
  const [selectedHistoryReception, setSelectedHistoryReception] = useState<Record<string, unknown> | null>(
    null
  );
  const [historyModalSeries, setHistoryModalSeries] = useState<unknown[]>([]);
  const [showTimeline, setShowTimeline] = useState<Record<string, unknown> | null>(null);
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

  return {
    selectedHistoryReception,
    historyModalSeries,
    handleOpenHistoryModal,
    onCloseHistoryDetail: () => setSelectedHistoryReception(null),
    onPrintHistoryDetail: () => window.print(),
    showTimeline,
    timelineActiveGuide,
    onShowTimeline: (rec: Record<string, unknown>) => setShowTimeline(rec),
    onTimelineActiveGuideChange: setTimelineActiveGuide,
    onCloseTimeline: () => setShowTimeline(null),
    selectedReception,
    selectedReceptionSeries,
    isLoadingSeries,
    handleViewReception,
    onCloseReceptionDrawer: () => setSelectedReception(null),
  };
}

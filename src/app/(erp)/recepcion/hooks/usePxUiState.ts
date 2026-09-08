'use client';

import { useEffect, useRef, useState } from 'react';
import { getPxBoxesDefault } from '@/shared/constants/batchLimits';
import type { CurrentEntry, GuideData } from '../types/reception.types';

/** Solo preferencias de UI — los datos operativos viven en TanStack Query (snapshot). */
const UI_PREFS_KEY = 'tc_erp_px_ui_prefs';

type UiPrefs = {
  selectedBoxForScan?: string | null;
  guideDataDraft?: Partial<GuideData>;
};

export type PxUiState = {
  /** Borrador de cabecera antes/durante edición local */
  guideData: GuideData;
  setGuideData: (v: GuideData | ((prev: GuideData) => GuideData)) => void;
  currentScans: string[];
  setCurrentScans: (v: string[]) => void;
  selectedBoxForScan: string | null;
  setSelectedBoxForScan: (v: string | null) => void;
  currentEntry: CurrentEntry;
  setCurrentEntry: (v: CurrentEntry | ((prev: CurrentEntry) => CurrentEntry)) => void;
  isReceptionStarted: boolean;
  setIsReceptionStarted: (v: boolean) => void;
  lastSavedAt: string | null;
  setLastSavedAt: (v: string | null) => void;
  pxRecords: Array<Record<string, unknown>>;
  setPxRecords: (v: Array<Record<string, unknown>> | ((prev: Array<Record<string, unknown>>) => Array<Record<string, unknown>>)) => void;
  showPxDetails: Record<string, unknown> | null;
  setShowPxDetails: (v: Record<string, unknown> | null) => void;
  pxDetailsSeries: Array<Record<string, unknown>>;
  setPxDetailsSeries: (v: Array<Record<string, unknown>>) => void;
};

/**
 * Presentation state — botones, inputs, filtros, borradores locales.
 * NO contiene manifest/scanned/closed (server state + overlay optimista).
 */
export function usePxUiState(): PxUiState {
  const [isReceptionStarted, setIsReceptionStarted] = useState<boolean>(false);
  const [currentScans, setCurrentScans] = useState<string[]>(['', '', '', '']);
  const [selectedBoxForScan, setSelectedBoxForScan] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [guideData, setGuideData] = useState<GuideData>({
    sap: '',
    docReferencia: '',
    agencia: 'Monte Verdes',
    proveedorPx: '',
    guia: '',
    piloto: '',
    courier: '',
    totalCajasEsperadas: getPxBoxesDefault(),
  });

  const [currentEntry, setCurrentEntry] = useState<CurrentEntry>({
    tecnologia: 'ONT / MODEM',
    marca: '',
    modelo: '',
    totalEsperado: 0,
  });

  const [pxRecords, setPxRecords] = useState<Array<Record<string, unknown>>>([]);
  const [showPxDetails, setShowPxDetails] = useState<Record<string, unknown> | null>(null);
  const [pxDetailsSeries, setPxDetailsSeries] = useState<Array<Record<string, unknown>>>([]);

  const isFirstSave = useRef(true);

  useEffect(() => {
    try {
      const legacy = localStorage.getItem('tc_erp_px_reception_state');
      if (legacy) localStorage.removeItem('tc_erp_px_reception_state');

      const saved = localStorage.getItem(UI_PREFS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as UiPrefs;
        if (parsed.selectedBoxForScan) setSelectedBoxForScan(parsed.selectedBoxForScan);
        if (parsed.guideDataDraft) {
          setGuideData((prev) => ({ ...prev, ...parsed.guideDataDraft }));
        }
      }
    } catch (e) {
      console.error('Error loading PX UI prefs', e);
    }
  }, []);

  useEffect(() => {
    if (isFirstSave.current) {
      isFirstSave.current = false;
      return;
    }
    const timer = setTimeout(() => {
      try {
        const prefs: UiPrefs = {
          selectedBoxForScan,
          guideDataDraft: isReceptionStarted
            ? undefined
            : {
                sap: guideData.sap,
                docReferencia: guideData.docReferencia,
                proveedorPx: guideData.proveedorPx,
                agencia: guideData.agencia,
                piloto: guideData.piloto,
                courier: guideData.courier,
                totalCajasEsperadas: guideData.totalCajasEsperadas,
              },
        };
        localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
      } catch (e) {
        console.error('Error saving PX UI prefs', e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedBoxForScan, guideData, isReceptionStarted]);

  return {
    guideData,
    setGuideData,
    currentScans,
    setCurrentScans,
    selectedBoxForScan,
    setSelectedBoxForScan,
    currentEntry,
    setCurrentEntry,
    isReceptionStarted,
    setIsReceptionStarted,
    lastSavedAt,
    setLastSavedAt,
    pxRecords,
    setPxRecords,
    showPxDetails,
    setShowPxDetails,
    pxDetailsSeries,
    setPxDetailsSeries,
  };
}

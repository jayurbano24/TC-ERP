import { useEffect, useRef, useState } from 'react';
import { getPxBoxesDefault } from '@/shared/constants/batchLimits';
import { PxManifestItem, PxScannedSeries, GuideData, CurrentEntry } from '../types/reception.types';

/** Solo preferencias de UI — los datos operativos viven en Supabase (captura incremental). */
const UI_PREFS_KEY = 'tc_erp_px_ui_prefs';

type UiPrefs = {
  selectedBoxForScan?: string | null;
  guideDataDraft?: Partial<GuideData>;
};

export const useReceptionPX = () => {
  const [isReceptionStarted, setIsReceptionStarted] = useState<boolean>(false);
  const [manifestItems, setManifestItems] = useState<PxManifestItem[]>([]);
  const [scannedSeries, setScannedSeries] = useState<PxScannedSeries[]>([]);
  const [closedBoxes, setClosedBoxes] = useState<string[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [currentScans, setCurrentScans] = useState<string[]>(['', '', '', '']);
  const [selectedBoxForScan, setSelectedBoxForScan] = useState<string | null>(null);

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

  const [pxRecords, setPxRecords] = useState<any[]>([]);
  const [showPxDetails, setShowPxDetails] = useState<any | null>(null);
  const [pxDetailsSeries, setPxDetailsSeries] = useState<any[]>([]);

  const isFirstSave = useRef(true);

  useEffect(() => {
    try {
      const legacy = localStorage.getItem('tc_erp_px_reception_state');
      if (legacy) {
        localStorage.removeItem('tc_erp_px_reception_state');
      }
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
    isReceptionStarted,
    setIsReceptionStarted,
    manifestItems,
    setManifestItems,
    scannedSeries,
    setScannedSeries,
    closedBoxes,
    setClosedBoxes,
    lastSavedAt,
    setLastSavedAt,
    currentScans,
    setCurrentScans,
    selectedBoxForScan,
    setSelectedBoxForScan,
    guideData,
    setGuideData,
    currentEntry,
    setCurrentEntry,
    pxRecords,
    setPxRecords,
    showPxDetails,
    setShowPxDetails,
    pxDetailsSeries,
    setPxDetailsSeries,
  };
};

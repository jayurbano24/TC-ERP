import { useState, useEffect, useRef } from 'react';
import { PxManifestItem, PxScannedSeries, GuideData, CurrentEntry } from '../types/reception.types';

const STORAGE_KEY = 'tc_erp_px_reception_state';
const SAVE_DEBOUNCE_MS = 500;

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
    totalCajasEsperadas: 1,
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
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.isReceptionStarted) setIsReceptionStarted(parsed.isReceptionStarted);
        if (parsed.manifestItems) setManifestItems(parsed.manifestItems);
        if (parsed.scannedSeries) setScannedSeries(parsed.scannedSeries);
        if (parsed.closedBoxes) setClosedBoxes(parsed.closedBoxes);
        if (parsed.selectedBoxForScan) setSelectedBoxForScan(parsed.selectedBoxForScan);
        if (parsed.guideData) setGuideData(parsed.guideData);
        if (parsed.currentEntry) setCurrentEntry(parsed.currentEntry);
        if (parsed.lastSavedAt) setLastSavedAt(parsed.lastSavedAt);
      }
    } catch (e) {
      console.error('Error loading PX state from local storage', e);
    }
  }, []);

  useEffect(() => {
    if (isFirstSave.current) {
      isFirstSave.current = false;
      return;
    }
    const timer = setTimeout(() => {
      try {
        const stateToSave = {
          isReceptionStarted,
          manifestItems,
          scannedSeries,
          closedBoxes,
          selectedBoxForScan,
          guideData,
          currentEntry,
          lastSavedAt: new Date().toISOString(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
        setLastSavedAt(stateToSave.lastSavedAt);
      } catch (e) {
        console.error('Error saving PX state to local storage', e);
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
          alert(
            'No se pudo guardar más datos en el navegador. Finalice o exporte pronto; considere cerrar cajas completas y finalizar la recepción.'
          );
        }
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isReceptionStarted, manifestItems, scannedSeries, closedBoxes, selectedBoxForScan, guideData, currentEntry]);

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

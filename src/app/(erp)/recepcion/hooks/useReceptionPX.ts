import { useState, useEffect } from 'react';
import { PxManifestItem, PxScannedSeries, GuideData, CurrentEntry } from '../types/reception.types';

const STORAGE_KEY = 'tc_erp_px_reception_state';

export const useReceptionPX = () => {
  const [isReceptionStarted, setIsReceptionStarted] = useState<boolean>(false);
  const [manifestItems, setManifestItems] = useState<PxManifestItem[]>([]);
  const [scannedSeries, setScannedSeries] = useState<PxScannedSeries[]>([]);
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
    totalCajasEsperadas: 1 
  });
  
  const [currentEntry, setCurrentEntry] = useState<CurrentEntry>({ 
    tecnologia: 'ONT / MODEM', 
    marca: '', 
    modelo: '', 
    totalEsperado: 0 
  });
  
  const [pxRecords, setPxRecords] = useState<any[]>([]);
  const [showPxDetails, setShowPxDetails] = useState<any | null>(null);
  const [pxDetailsSeries, setPxDetailsSeries] = useState<any[]>([]);

  // Cargar estado guardado al montar
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.isReceptionStarted) setIsReceptionStarted(parsed.isReceptionStarted);
        if (parsed.manifestItems) setManifestItems(parsed.manifestItems);
        if (parsed.scannedSeries) setScannedSeries(parsed.scannedSeries);
        if (parsed.selectedBoxForScan) setSelectedBoxForScan(parsed.selectedBoxForScan);
        if (parsed.guideData) setGuideData(parsed.guideData);
        if (parsed.currentEntry) setCurrentEntry(parsed.currentEntry);
      }
    } catch (e) {
      console.error("Error loading PX state from local storage", e);
    }
  }, []);

  // Guardar estado cada vez que cambian variables importantes
  useEffect(() => {
    try {
      const stateToSave = {
        isReceptionStarted,
        manifestItems,
        scannedSeries,
        selectedBoxForScan,
        guideData,
        currentEntry
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error("Error saving PX state to local storage", e);
    }
  }, [isReceptionStarted, manifestItems, scannedSeries, selectedBoxForScan, guideData, currentEntry]);

  // Si se finaliza la recepción, limpiar el local storage (debería llamarse desde handleFinalizePX en page.tsx,
  // pero page.tsx resetea los estados de todos modos, lo cual disparará el useEffect de guardado y los dejará vacíos).

  return {
    isReceptionStarted, setIsReceptionStarted,
    manifestItems, setManifestItems,
    scannedSeries, setScannedSeries,
    currentScans, setCurrentScans,
    selectedBoxForScan, setSelectedBoxForScan,
    guideData, setGuideData,
    currentEntry, setCurrentEntry,
    pxRecords, setPxRecords,
    showPxDetails, setShowPxDetails,
    pxDetailsSeries, setPxDetailsSeries
  };
};

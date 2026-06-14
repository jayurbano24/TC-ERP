import { useState } from 'react';
import { PxManifestItem, PxScannedSeries, GuideData, CurrentEntry } from '../types/reception.types';

export const useReceptionPX = () => {
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
    courier: '' 
  });
  
  const [currentEntry, setCurrentEntry] = useState<CurrentEntry>({ 
    tecnologia: 'ONT / MODEM', 
    marca: 'Huawei', 
    modelo: 'HG8245H', 
    totalEsperado: 0 
  });
  
  const [pxRecords, setPxRecords] = useState<any[]>([]);
  const [showPxDetails, setShowPxDetails] = useState<any | null>(null);
  const [pxDetailsSeries, setPxDetailsSeries] = useState<any[]>([]);

  return {
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

import { useState } from 'react';

export const useReceptionCAC = () => {
  const [showCacForm, setShowCacForm] = useState(false);
  const [cacRecords, setCacRecords] = useState<any[]>([]);
  const [cacFormStep, setCacFormStep] = useState<'data' | 'evidence'>('data');
  const [cacScannedItems, setCacScannedItems] = useState<string[]>([]);
  const [cacScanInput, setCacScanInput] = useState('');
  const [cacTotalCajas, setCacTotalCajas] = useState(0);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  
  const [cacCarrier, setCacCarrier] = useState('');
  const [cacPilot, setCacPilot] = useState('');
  const [cacAgency, setCacAgency] = useState('');
  const [cacError, setCacError] = useState('');

  return {
    showCacForm, setShowCacForm,
    cacRecords, setCacRecords,
    cacFormStep, setCacFormStep,
    cacScannedItems, setCacScannedItems,
    cacScanInput, setCacScanInput,
    cacTotalCajas, setCacTotalCajas,
    expandedRecordId, setExpandedRecordId,
    cacCarrier, setCacCarrier,
    cacPilot, setCacPilot,
    cacAgency, setCacAgency,
    cacError, setCacError
  };
};

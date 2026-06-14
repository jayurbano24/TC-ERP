import { useState, useRef, useEffect } from 'react';

export const useReceptionScanner = () => {
  const [isIndustrialScanning, setIsIndustrialScanning] = useState(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Focus utility for industrial scanning
  useEffect(() => {
    if (isIndustrialScanning && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [isIndustrialScanning]);

  const toggleIndustrialScanning = () => {
    setIsIndustrialScanning(prev => !prev);
  };

  const toggleCameraScanner = () => {
    setIsCameraScannerOpen(prev => !prev);
  };

  return {
    isIndustrialScanning,
    setIsIndustrialScanning,
    isCameraScannerOpen,
    setIsCameraScannerOpen,
    scanInputRef,
    toggleIndustrialScanning,
    toggleCameraScanner
  };
};

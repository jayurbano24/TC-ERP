import { useState } from 'react';
import { validationService } from '../services/validationService';

export const useReceptionValidation = () => {
  const [validationError, setValidationError] = useState<string | null>(null);

  const checkSerial = async (serial: string) => {
    setValidationError(null);
    const result = await validationService.checkSerialInSystem(serial);
    if (result.blocked) {
      setValidationError(result.info);
    }
    return result;
  };

  const validateCAC = (scannedItems: string[], expectedCount: number) => {
    const error = validationService.validateCACGuide(scannedItems, expectedCount);
    if (error) {
      setValidationError(error);
      return false;
    }
    setValidationError(null);
    return true;
  };

  return {
    validationError,
    setValidationError,
    checkSerial,
    validateCAC
  };
};

'use client';

import { useEffect, useState } from 'react';
import { getActualUserFullName } from '@/lib/auth';
import { formatDisplayDate } from '@/lib/formatDisplayDate';

export function useBackofficeSession() {
  const [currentUserFullName, setCurrentUserFullName] = useState('SISTEMA');
  const [canReturnToPending, setCanReturnToPending] = useState(false);
  const [processingDateLabel, setProcessingDateLabel] = useState('');

  useEffect(() => {
    void getActualUserFullName().then(setCurrentUserFullName);
  }, []);

  useEffect(() => {
    const role = localStorage.getItem('user_role');
    setCanReturnToPending(role === 'TI' || role === 'ROOT');
    setProcessingDateLabel(formatDisplayDate(new Date()));
  }, []);

  return { currentUserFullName, canReturnToPending, processingDateLabel };
}

'use client';

import { useCallback, useState } from 'react';
import { updateReception } from '@/lib/database/receptions';
import { sanitizeCacAgencyRaw } from '@/lib/cacAgencyUtils';
import type { CatalogAgency } from '../../types';

type Params = {
  CAC_AGENCIES: CatalogAgency[];
  fetchHistory: (opts?: { silent?: boolean }) => Promise<void>;
};

export function useEditMetaModal({ CAC_AGENCIES, fetchHistory }: Params) {
  const [editMetaRec, setEditMetaRec] = useState<Record<string, unknown> | null>(null);
  const [editMeta, setEditMeta] = useState({ agency: '', tech: '', brand: '', model: '' });
  const [editMetaSaving, setEditMetaSaving] = useState(false);

  const handleOpenEditMeta = useCallback(
    (rec: Record<string, unknown>) => {
      const notes = String(rec.notes || '');
      const carrier = rec.carrier;
      setEditMetaRec(rec);
      setEditMeta({
        agency: sanitizeCacAgencyRaw(
          notes.includes('Backoffice_Agency: ')
            ? notes.split('Backoffice_Agency: ')[1]?.split('\n')[0]?.trim()
            : '',
          carrier,
          CAC_AGENCIES
        ),
        tech: notes.includes('Backoffice_Tech: ')
          ? notes.split('Backoffice_Tech: ')[1]?.split('\n')[0]?.trim() || ''
          : '',
        brand: notes.includes('Backoffice_Brand: ')
          ? notes.split('Backoffice_Brand: ')[1]?.split('\n')[0]?.trim() || ''
          : '',
        model: notes.includes('Backoffice_Model: ')
          ? notes.split('Backoffice_Model: ')[1]?.split('\n')[0]?.trim() || ''
          : '',
      });
    },
    [CAC_AGENCIES]
  );

  const handleSaveEditMeta = useCallback(async () => {
    if (!editMetaRec) return;
    setEditMetaSaving(true);
    const baseNotes = String(editMetaRec.notes || '')
      .split('\n')
      .filter(
        (line) =>
          !line.startsWith('Backoffice_Agency:') &&
          !line.startsWith('Backoffice_Tech:') &&
          !line.startsWith('Backoffice_Brand:') &&
          !line.startsWith('Backoffice_Model:')
      )
      .join('\n');
    const newNotes =
      baseNotes +
      `\nBackoffice_Agency: ${editMeta.agency}` +
      `\nBackoffice_Tech: ${editMeta.tech}` +
      `\nBackoffice_Brand: ${editMeta.brand}` +
      `\nBackoffice_Model: ${editMeta.model}`;
    await updateReception(String(editMetaRec.id), { notes: newNotes });
    await fetchHistory();
    setEditMetaRec(null);
    setEditMetaSaving(false);
  }, [editMeta, editMetaRec, fetchHistory]);

  return {
    editMetaRec,
    editMeta,
    editMetaSaving,
    handleOpenEditMeta,
    onEditMetaChange: (patch: Partial<typeof editMeta>) =>
      setEditMeta((prev) => ({ ...prev, ...patch })),
    handleSaveEditMeta,
    onCloseEditMeta: () => setEditMetaRec(null),
  };
}

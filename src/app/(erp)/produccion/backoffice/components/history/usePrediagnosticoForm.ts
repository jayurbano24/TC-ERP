'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/http/apiFetch';
import { notify } from '@/components/ui';
import type { ShellClass, Verdict } from '@/modules/backoffice/prediagnostico/validatePrediagnostico';

export type CatalogCheckItem = {
  id: string;
  name: string;
  kind: 'cosmetico' | 'funcionamiento';
};

export type PrediagnosticoFormState = {
  shellClass: ShellClass | null;
  cosmetics: Record<string, string>;
  functionChecks: Record<string, string>;
  verdict: Verdict | null;
  notes: string;
};

const EMPTY_FORM: PrediagnosticoFormState = {
  shellClass: null,
  cosmetics: {},
  functionChecks: {},
  verdict: null,
  notes: '',
};

type LoadedItem = {
  shellClass: ShellClass;
  cosmetics: Record<string, string>;
  functionChecks: Record<string, string>;
  verdict: Verdict;
  notes: string;
  updatedByName: string | null;
  updatedAt: string;
};

export function usePrediagnosticoForm(
  serviceOrderIds: string[],
  techId: string,
  brandId: string,
  open: boolean
) {
  const [form, setForm] = useState<PrediagnosticoFormState>(EMPTY_FORM);
  const [items, setItems] = useState<CatalogCheckItem[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedLabel, setSavedLabel] = useState('');

  const idsKey = serviceOrderIds.join(',');

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    const anchorId = ids.length === 1 ? ids[0] : '';
    if (!open || ids.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setErrors([]);
    const params = new URLSearchParams();
    if (anchorId) params.set('serviceOrderId', anchorId);
    if (techId) params.set('techId', techId);
    if (brandId) params.set('brandId', brandId);

    void apiFetch(`/api/v1/backoffice/prediagnostico?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo cargar el prediagnóstico');
        if (cancelled) return;
        const item = data.item as LoadedItem | null;
        setCanEdit(Boolean(data.canEdit));
        setItems((data.items || []) as CatalogCheckItem[]);
        if (anchorId) {
          setForm(
            item
              ? {
                  shellClass: item.shellClass,
                  cosmetics: item.cosmetics || {},
                  functionChecks: item.functionChecks || {},
                  verdict: item.verdict,
                  notes: item.notes || '',
                }
              : EMPTY_FORM
          );
        }
        if (anchorId && item?.updatedByName) {
          setSavedLabel(`${item.updatedByName} · ${new Date(item.updatedAt).toLocaleString('es-GT')}`);
        } else if (anchorId) {
          setSavedLabel('');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          notify.error(err instanceof Error ? err.message : 'No se pudo cargar el prediagnóstico');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, idsKey, techId, brandId]);

  const save = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const res = await apiFetch('/api/v1/backoffice/prediagnostico/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceOrderIds, ...form }),
      });
      const data = await res.json();
      if (!res.ok) {
        const list = Array.isArray(data.issues) ? (data.issues as string[]) : [];
        setErrors(list.length > 0 ? list : [data.error || 'No se pudo guardar']);
        return false;
      }
      notify.success(
        serviceOrderIds.length === 1
          ? 'Prediagnóstico guardado'
          : `Prediagnóstico guardado en ${serviceOrderIds.length} órdenes`
      );
      return true;
    } catch (err: unknown) {
      setErrors([err instanceof Error ? err.message : 'No se pudo guardar']);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { form, setForm, items, canEdit, loading, saving, errors, savedLabel, save };
}

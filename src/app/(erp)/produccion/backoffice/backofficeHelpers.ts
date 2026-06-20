import { formatAgencyLabel, resolveUnitAgencyRaw } from './historyTrayUtils';
import { sanitizeCacAgencyRaw } from '@/lib/cacAgencyUtils';
import type { CatalogAgency, CatalogTech, GuideItem } from './types';

export function summarizeSapGroupGuideItems(
  groupId: string,
  items: GuideItem[],
  technologies: CatalogTech[]
) {
  const groupItems = items.filter((i) => i.sapGroupId === groupId);
  const byTech = new Map<string, { name: string; units: number }>();
  let totalUnits = 0;

  for (const item of groupItems) {
    const tech = technologies.find((t) => t.id === item.tipo);
    const key = item.tipo || 'unknown';
    const prev = byTech.get(key) || { name: tech?.nombre || '---', units: 0 };
    prev.units += item.cantidad;
    byTech.set(key, prev);
    totalUnits += item.cantidad;
  }

  return {
    techLines: Array.from(byTech.values()),
    totalUnits,
    itemCount: groupItems.length,
  };
}

export const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

export const getReceiverName = (rec: any) => {
  if (!rec) return 'SISTEMA';
  const cacReceiverMatch = rec.notes?.split('Recibido Por: ')?.[1]?.split('\n')?.[0]?.trim();
  const cacReceiver = cacReceiverMatch ? cacReceiverMatch.split('@')[0].toUpperCase() : null;

  const backofficeReceiversMatch = rec.notes?.match(/Por:\s*([^\n]+)/g);
  let backofficeReceivers: string[] = [];
  if (backofficeReceiversMatch) {
    backofficeReceivers = Array.from(
      new Set(backofficeReceiversMatch.map((m: string) => m.replace('Por:', '').trim().toUpperCase()))
    );
  }

  if (backofficeReceivers.length > 0) return backofficeReceivers.join(' / ');
  if (cacReceiver) return cacReceiver;
  if (rec.received_by) return rec.received_by.split('@')[0].toUpperCase();
  if (rec.usuario) return rec.usuario.split('@')[0].toUpperCase();

  return 'SISTEMA';
};

export const getAgenciaLabel = (
  rec: any,
  agencies: CatalogAgency[],
  guideId?: string,
  unit?: any[]
) => {
  if (!rec) return '---';
  const raw = guideId
    ? resolveUnitAgencyRaw(rec, guideId, unit || [])
    : sanitizeCacAgencyRaw(
        (rec.reception_guides || []).find((rg: any) => rg.agency)?.agency ||
          (rec.notes?.includes('Backoffice_Agency: ')
            ? rec.notes.split('Backoffice_Agency: ')[1]?.split('\n')[0]?.trim()
            : ''),
        rec.carrier,
        agencies
      );
  if (raw) return formatAgencyLabel(raw, agencies, rec?.carrier);
  return '---';
};

export const generateMovId = () => `MOV-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

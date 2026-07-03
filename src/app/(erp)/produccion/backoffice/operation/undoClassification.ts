'use client';

import { RECEPTION_UNDO_SELECT } from '@/shared/constants/dbProjections';
import type React from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { notify, confirmDialog } from '@/components/ui/messaging/messageStore';
import type { BackofficeReception } from '../types';

type UndoCtx = {
  activeReception: BackofficeReception | null;
  processedGuides: string[];
  setProcessedGuides: React.Dispatch<React.SetStateAction<string[]>>;
  setActiveReception: React.Dispatch<React.SetStateAction<BackofficeReception | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  fetchPending: (opts?: { silent?: boolean }) => Promise<void>;
  fetchHistory: (opts?: { silent?: boolean }) => Promise<void>;
};

export async function runUndoClassification(ctx: UndoCtx, guia: string) {
  const ok = await confirmDialog({
    title: 'Reclasificar guía',
    message: `¿Está seguro que desea reclasificar la guía ${guia}? Esto borrará la clasificación anterior y deberá hacerla de nuevo.`,
    confirmText: 'Reclasificar',
  });
  if (!ok) {
    return;
  }
  ctx.setLoading(true);
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let currentNotes = ctx.activeReception?.notes || '';
    const guiaPattern = new RegExp(
      `\[Guía.*?(?:${guia.replace(/[-]/g, '\-')}).*?\][\s\S]*?(?=\[Guía|---|$)`,
      'gi'
    );

    const guideBlocks = currentNotes.match(guiaPattern);
    const serialsToDelete: string[] = [];

    if (guideBlocks) {
      for (const block of guideBlocks) {
        const sMatches = block.match(/S-\d+: (.*)/g);
        if (sMatches) {
          for (const m of sMatches) {
            const sn = m.split(': ')[1]?.trim();
            if (sn && sn !== '---') serialsToDelete.push(sn);
          }
        }
      }
    }

    if (serialsToDelete.length > 0 && ctx.activeReception?.id) {
      await supabase
        .from('series')
        .delete()
        .eq('current_reception_id', ctx.activeReception.id)
        .in('serial_number', serialsToDelete);

      await supabase
        .from('service_orders')
        .delete()
        .eq('reception_id', ctx.activeReception.id)
        .in('main_serial', serialsToDelete);
    }

    if (ctx.activeReception?.id) {
      await supabase.from('boxes').delete().eq('reception_id', ctx.activeReception.id).eq('box_code', guia);

      currentNotes = currentNotes.replace(guiaPattern, '').trim();
      const timelinePattern = new RegExp(
        `^\[.*\].*CLASIFICACIÓN.*?(?:${guia.replace(/[-]/g, '\-')}).*?$`,
        'gim'
      );
      currentNotes = currentNotes.replace(timelinePattern, '').trim();

      await supabase.from('receptions').update({ notes: currentNotes }).eq('id', ctx.activeReception.id);

      const newProcessed = ctx.processedGuides.filter((g) => g !== guia);
      ctx.setProcessedGuides(newProcessed);
      await supabase.from('receptions').update({ processed_guides: newProcessed }).eq('id', ctx.activeReception.id);

      const { data: updatedRec } = await supabase
        .from('receptions')
        .select(RECEPTION_UNDO_SELECT)
        .eq('id', ctx.activeReception.id)
        .single();

      if (newProcessed.length === 0) {
        await supabase.from('receptions').update({ status: 'PENDIENTE_BACKOFFICE' }).eq('id', ctx.activeReception.id);
        if (updatedRec) (updatedRec as BackofficeReception).status = 'PENDIENTE_BACKOFFICE';
      }

      if (updatedRec) ctx.setActiveReception(updatedRec as BackofficeReception);
    }

    await ctx.fetchPending();
    await ctx.fetchHistory();
    notify.success(`Guía ${guia} restaurada`, { description: 'Ahora puede volver a clasificarla.' });
  } catch (err) {
    console.error(err);
    notify.error('Error al intentar deshacer la clasificación.');
  } finally {
    ctx.setLoading(false);
  }
}

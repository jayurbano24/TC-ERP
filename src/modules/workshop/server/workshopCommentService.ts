import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { expandSeriesIdsToEquipmentSiblings } from '@/modules/workshop/server/workshopOperateService';

function chunkIds(ids: string[], size = BATCH_LIMITS.UUID_IN_CLAUSE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/**
 * Comentario operativo por equipo (OS): auditoría + notas en series hermanas.
 */
export async function addWorkshopSeriesComment(
  _userClient: SupabaseClient,
  params: {
    seriesIds: string[];
    comment: string;
    userId: string;
    userRole?: string;
    operatorName?: string;
    tab?: string;
  }
): Promise<{ processed: number }> {
  const { seriesIds, comment, userId, userRole, operatorName, tab } = params;
  const text = String(comment || '').trim();
  if (!text) throw new Error('El comentario no puede estar vacío.');
  if (seriesIds.length === 0) return { processed: 0 };

  const admin = getSupabaseServerClient();
  const targetSeriesIds = await expandSeriesIdsToEquipmentSiblings(admin, seriesIds);
  const stamp = new Date().toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const author = operatorName || 'Operador';
  const line = `[${stamp}] ${author}: ${text}`;

  let processed = 0;

  for (const chunk of chunkIds(targetSeriesIds)) {
    const { data: rows, error: readError } = await admin
      .from('series')
      .select('id, notes')
      .in('id', chunk);
    if (readError) throw new Error(readError.message);

    for (const row of rows || []) {
      const prev = String(row.notes || '').trim();
      const nextNotes = prev ? `${line}\n${prev}` : line;
      const { error: updError } = await admin
        .from('series')
        .update({ notes: nextNotes })
        .eq('id', row.id);
      if (updError) throw new Error(updError.message);
      processed += 1;
    }

    const auditRows = chunk.map((recordId) => ({
      user_id: userId,
      user_role: userRole || 'Desconocido',
      module: 'Taller',
      table_name: 'series',
      record_id: recordId,
      action: 'COMENTARIO TALLER',
      severity: 'INFO',
      new_values: {
        notes: text,
        comment: text,
        tab: tab || null,
        operator_name: operatorName,
        equipment_complete: true,
      },
      user_agent: 'api/v1/workshop/comments',
    }));

    const { error: auditError } = await admin.from('erp_audit_logs').insert(auditRows);
    if (auditError) throw new Error(`Auditoría: ${auditError.message}`);
  }

  return { processed };
}

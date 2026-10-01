import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PrediagnosticoRecord,
  PrediagnosticoStore,
} from './prediagnosticoService';
import type { ShellClass, Verdict } from './validatePrediagnostico';

type Row = {
  id: string;
  service_order_id: string;
  clase_carcasa: ShellClass;
  detalles_cosmeticos: Record<string, string> | null;
  funcionamiento: Record<string, string> | null;
  dictamen: Verdict;
  observaciones: string | null;
  creado_por: string | null;
  creado_por_nombre: string | null;
  creado_en: string;
  actualizado_por: string | null;
  actualizado_por_nombre: string | null;
  actualizado_en: string;
};

function toRecord(row: Row): PrediagnosticoRecord {
  return {
    id: row.id,
    serviceOrderId: row.service_order_id,
    shellClass: row.clase_carcasa,
    cosmetics: row.detalles_cosmeticos || {},
    functionChecks: row.funcionamiento || {},
    verdict: row.dictamen,
    notes: row.observaciones || '',
    createdBy: row.creado_por,
    createdByName: row.creado_por_nombre,
    createdAt: row.creado_en,
    updatedBy: row.actualizado_por,
    updatedByName: row.actualizado_por_nombre,
    updatedAt: row.actualizado_en,
  };
}

function toDb(record: PrediagnosticoRecord) {
  return {
    id: record.id,
    service_order_id: record.serviceOrderId,
    clase_carcasa: record.shellClass,
    detalles_cosmeticos: record.cosmetics,
    funcionamiento: record.functionChecks,
    dictamen: record.verdict,
    observaciones: record.notes || null,
    creado_por: record.createdBy,
    creado_por_nombre: record.createdByName,
    creado_en: record.createdAt,
    actualizado_por: record.updatedBy,
    actualizado_por_nombre: record.updatedByName,
    actualizado_en: record.updatedAt,
  };
}

export function createPrediagnosticoStore(client: SupabaseClient): PrediagnosticoStore {
  return {
    async findByServiceOrder(serviceOrderId) {
      const { data, error } = await client
        .from('prediagnosticos')
        .select('*')
        .eq('service_order_id', serviceOrderId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toRecord(data as Row) : null;
    },
    async insert(record) {
      const { data, error } = await client.from('prediagnosticos').insert(toDb(record)).select('*').single();
      if (error) throw new Error(error.message);
      return toRecord(data as Row);
    },
    async update(id, record) {
      const { data, error } = await client
        .from('prediagnosticos')
        .update(toDb(record))
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return toRecord(data as Row);
    },
    async insertRevision(record) {
      const { error } = await client.from('prediagnostico_revisiones').insert({
        prediagnostico_id: record.id,
        service_order_id: record.serviceOrderId,
        clase_carcasa: record.shellClass,
        detalles_cosmeticos: record.cosmetics,
        funcionamiento: record.functionChecks,
        dictamen: record.verdict,
        observaciones: record.notes || null,
        editado_por: record.updatedBy,
        editado_por_nombre: record.updatedByName,
        editado_en: record.updatedAt,
      });
      if (error) throw new Error(error.message);
    },
  };
}

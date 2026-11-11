import type { SupabaseClient } from '@supabase/supabase-js';
import { planNextOutboundCodes, reserveNextOutboundCode } from '@/lib/api/outboundCodeReservation';

const MANUAL_RECEPTION_GUIDE = 'MANUAL_BOXES_DESPACHO';

export type CreateOutboundBoxesInput = {
  brandId: string;
  modelId: string;
  capacity: number;
  material: string | null;
  valuation: string;
  count: number;
};

export type CreateOutboundBoxesResult = {
  createdCodes: string[];
  receptionId: string;
};

async function resolveManualDespachoReceptionId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from('receptions')
    .select('id')
    .eq('guide_number', MANUAL_RECEPTION_GUIDE)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo resolver la recepción base de despacho: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error(
      'Falta la recepción MANUAL_BOXES_DESPACHO en el sistema. Contacte a TI antes de crear Outbounds.'
    );
  }
  return String(data.id);
}

/**
 * Crea N cajas Outbound vacías usando correlativo oficial en servidor (service_role).
 * Si falta RPC next_outbound_code en prod (404), reserva por escaneo global OB-*.
 */
export async function createOutboundBoxesBatch(
  supabase: SupabaseClient,
  input: CreateOutboundBoxesInput
): Promise<CreateOutboundBoxesResult> {
  const receptionId = await resolveManualDespachoReceptionId(supabase);
  const createdCodes: string[] = [];
  const valuation = input.valuation.trim();
  const material = input.material?.trim() ? input.material.trim() : null;

  let plannedCodes = await planNextOutboundCodes(supabase, input.count);

  for (let i = 0; i < input.count; i++) {
    let inserted = false;
    let lastMsg = '';

    for (let attempt = 0; attempt < 8; attempt++) {
      const boxCode = plannedCodes[i] ?? (await reserveNextOutboundCode(supabase));
      const { error } = await supabase.from('boxes').insert({
        reception_id: receptionId,
        box_code: boxCode,
        brand_id: input.brandId,
        model_id: input.modelId,
        capacity: input.capacity,
        material,
        valuation,
        status: 'open',
        rack_location: 'OUTBOUND',
      });

      if (!error) {
        createdCodes.push(boxCode);
        inserted = true;
        break;
      }

      lastMsg = error.message;
      const retryable = /duplicate|unique|box_code|409/i.test(error.message);
      if (!retryable) {
        throw new Error(
          `Error al crear ${boxCode}: ${error.message}${createdCodes.length ? ` (${createdCodes.length} cajas ya creadas: ${createdCodes.join(', ')})` : ''}`
        );
      }

      plannedCodes[i] = await reserveNextOutboundCode(supabase);
    }

    if (!inserted) {
      throw new Error(
        lastMsg
          ? `Conflicto de código OB tras varios intentos: ${lastMsg}`
          : 'Conflicto de código OB tras varios intentos.'
      );
    }
  }

  return { createdCodes, receptionId };
}

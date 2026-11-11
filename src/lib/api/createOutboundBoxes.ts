import type { SupabaseClient } from '@supabase/supabase-js';

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

async function reserveOutboundCode(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('next_outbound_code');
  if (error) {
    throw new Error(
      error.message?.includes('NO_OUTBOUND_CODE')
        ? 'No hay correlativos OB disponibles. Contacte a TI.'
        : `No se pudo reservar código OB (next_outbound_code): ${error.message}`
    );
  }
  const code = data != null ? String(data).trim() : '';
  if (!code) {
    throw new Error('next_outbound_code no devolvió un código. Contacte a TI.');
  }
  return code;
}

/**
 * Crea N cajas Outbound vacías usando correlativo oficial en servidor (service_role).
 */
export async function createOutboundBoxesBatch(
  supabase: SupabaseClient,
  input: CreateOutboundBoxesInput
): Promise<CreateOutboundBoxesResult> {
  const receptionId = await resolveManualDespachoReceptionId(supabase);
  const createdCodes: string[] = [];
  const valuation = input.valuation.trim();
  const material = input.material?.trim() ? input.material.trim() : null;

  for (let i = 0; i < input.count; i++) {
    let inserted = false;
    let lastMsg = '';

    for (let attempt = 0; attempt < 8; attempt++) {
      const boxCode = await reserveOutboundCode(supabase);
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
      const retryable = /duplicate|unique|box_code/i.test(error.message);
      if (!retryable) {
        throw new Error(
          `Error al crear ${boxCode}: ${error.message}${createdCodes.length ? ` (${createdCodes.length} cajas ya creadas: ${createdCodes.join(', ')})` : ''}`
        );
      }
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

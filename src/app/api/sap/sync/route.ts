import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/shared/infrastructure/http/apiHandler";
import { parseJsonBody } from "@/shared/validation/parseRequest";

export const dynamic = "force-dynamic";

/**
 * SEC-P2: validación de entrada de la sincronización SAP. La ruta usa service role
 * y hace escrituras masivas (uploads, sesiones, detalles, equipos y series), por lo
 * que se acota la forma del payload antes de tocar la BD. `validationDetails` se deja
 * como registros genéricos (la BD rechaza columnas desconocidas) pero acotado a array.
 */
const SapSyncSchema = z.object({
  fileInfo: z.object({
    name: z.string().min(1).max(400),
    hash: z.string().max(128).optional().default(""),
    totalRows: z.coerce.number().int().nonnegative().optional().default(0),
    user: z.string().max(160).optional().default("Desconocido"),
  }),
  results: z.object({
    encontrados: z.coerce.number().int().nonnegative().optional().default(0),
    noEncontrados: z.coerce.number().int().nonnegative().optional().default(0),
    inconsistencias: z.coerce.number().int().nonnegative().optional().default(0),
    timeStr: z.string().max(60).optional().default(""),
  }),
  validationDetails: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  equiposUpdates: z
    .array(z.object({ id: z.string().min(1), sap_integration_status: z.string().max(120) }))
    .optional()
    .default([]),
  seriesUpdates: z
    .array(z.object({ id: z.string().min(1), sap_status: z.string().max(120) }))
    .optional()
    .default([]),
});

export const POST = withErrorHandler(async (request: Request) => {
  const { fileInfo, results, validationDetails, equiposUpdates, seriesUpdates } =
    await parseJsonBody(request, SapSyncSchema);

  const supabase = getSupabaseServerClient();

  // 1. Create upload record
  const { data: uploadData, error: uploadError } = await supabase
    .from('sap_uploads')
    .insert({
      archivo: fileInfo.name,
      hash_sha256: fileInfo.hash,
      usuario: fileInfo.user,
      registros: fileInfo.totalRows,
      encontrados: results.encontrados,
      no_encontrados: results.noEncontrados,
      inconsistencias: results.inconsistencias,
      tiempo_proceso: results.timeStr,
      estado: 'Completado'
    })
    .select()
    .single();

  if (uploadError) throw uploadError;

  // 2. Create validation session
  const { data: sessionData, error: sessionError } = await supabase
    .from('sap_validation_sessions')
    .insert({
      upload_id: uploadData.id,
      usuario: fileInfo.user,
      estado: 'Finalizado',
      fecha_fin: new Date().toISOString(),
      activa: true
    })
    .select()
    .single();

  if (sessionError) throw sessionError;

  const sessionId = sessionData.id;

  // Mark previous sessions as inactive
  await supabase.from('sap_validation_sessions')
    .update({ activa: false })
    .neq('id', sessionId);

  // 3. Insert Validation Details in batches
  const BATCH_SIZE = 1000;
  for (let i = 0; i < validationDetails.length; i += BATCH_SIZE) {
    const batch = validationDetails.slice(i, i + BATCH_SIZE).map((d) => ({
      ...d,
      validation_id: sessionId
    }));
    const { error: detailError } = await supabase.from('sap_validation_details').insert(batch);
    if (detailError) console.error("Error inserting details batch:", detailError);
  }

  // 4. Update service_orders (Equipos) in batches
  for (let i = 0; i < equiposUpdates.length; i += BATCH_SIZE) {
    const batch = equiposUpdates.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((eq) =>
      supabase.from('service_orders').update({
        sap_integration_status: eq.sap_integration_status,
        last_sap_sync: new Date().toISOString()
      }).eq('id', eq.id)
    ));
  }

  // 5. Update series in batches
  for (let i = 0; i < seriesUpdates.length; i += BATCH_SIZE) {
    const batch = seriesUpdates.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((s) =>
      supabase.from('series').update({
        sap_status: s.sap_status,
        sap_validation_id: sessionId
      }).eq('id', s.id)
    ));
  }

  return NextResponse.json({ success: true, sessionId });
}, { module: "sap", action: "sync" });

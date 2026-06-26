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

  // TX-01: toda la sincronización corre atómica en sap_sync_tx (rollback total ante error).
  const { data, error } = await supabase.rpc('sap_sync_tx', {
    p_file_info: fileInfo,
    p_results: results,
    p_validation_details: validationDetails,
    p_equipos_updates: equiposUpdates,
    p_series_updates: seriesUpdates,
  });

  if (error) throw error;

  const sessionId = (data as { session_id?: string } | null)?.session_id ?? null;
  return NextResponse.json({ success: true, sessionId });
}, { module: "sap", action: "sync" });

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeSerial } from '@/lib/sap/normalizeSerial';

/**
 * SEC-04: el número de serie es input no confiable. Se acota longitud y charset
 * (alfanumérico + separadores habituales) antes de usarlo en la consulta.
 */
const QuerySchema = z.object({
  sn: z
    .string()
    .trim()
    .min(1, "Parámetro 'sn' es requerido")
    .max(120)
    .regex(/^[A-Za-z0-9._\-/ ]+$/, 'Formato de serie inválido'),
});

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  const { searchParams } = new URL(request.url);

  const parsed = QuerySchema.safeParse({ sn: searchParams.get('sn') ?? '' });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Parámetro 'sn' inválido" },
      { status: 400 }
    );
  }
  const snRaw = parsed.data.sn;
  const sn = normalizeSerial(snRaw);

  try {
    // Preferir columna normalizada (migración 097); fallback a ilike exacto
    let seriesData: Record<string, unknown> | null = null;
    let seriesError: { message?: string } | null = null;

    const byNorm = await supabase
      .from('series')
      .select(`
        *,
        service_orders(
          id, os_label, sap_integration_status, last_sap_sync,
          series(serial_number, sap_status)
        )
      `)
      .eq('serial_normalized', sn)
      .limit(1)
      .maybeSingle();

    if (!byNorm.error && byNorm.data) {
      seriesData = byNorm.data as Record<string, unknown>;
    } else {
      // Fallback pre-migración / sin columna: case-insensitive
      const byIlike = await supabase
        .from('series')
        .select(`
          *,
          service_orders(
            id, os_label, sap_integration_status, last_sap_sync,
            series(serial_number, sap_status)
          )
        `)
        .ilike('serial_number', sn)
        .limit(1)
        .maybeSingle();
      seriesData = (byIlike.data as Record<string, unknown> | null) ?? null;
      seriesError = byIlike.error;
    }

    if (seriesError || !seriesData) {
      return NextResponse.json(
        { success: false, error: 'Serie no encontrada en inventario TC' },
        { status: 404 }
      );
    }

    const serviceOrders = seriesData.service_orders as { id?: string } | null | undefined;
    const equipoId = serviceOrders?.id;

    let validationDetails = null;
    if (equipoId) {
      const { data: vData, error: vError } = await supabase
        .from('sap_validation_details')
        .select(`
            *,
            sap_validation_sessions(fecha_fin, upload_id, sap_uploads(archivo, hash_sha256))
         `)
        .eq('equipo_id', equipoId)
        .order('id', { ascending: false })
        .limit(4);

      if (!vError && vData) {
        validationDetails = vData;
      }
    }

    return NextResponse.json({
      success: true,
      data: { series: seriesData, validations: validationDetails, queriedAs: sn },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error querying SAP series:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

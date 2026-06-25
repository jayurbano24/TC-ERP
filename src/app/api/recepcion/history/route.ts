import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';

export const dynamic = 'force-dynamic';

/**
 * Tope de seguridad: la UI pagina en cliente sobre el historial más reciente.
 * Evita traer todas las recepciones de golpe. Sustituir por `.range()` cuando
 * se implemente paginación server-side.
 */
const RECEPTIONS_SAFETY_LIMIT = 1000;

/**
 * Historial de recepciones (CAC/PX).
 *
 * Se sirve desde el servidor con service role porque la tabla `receptions`
 * tiene RLS (`auth.uid() IS NOT NULL`) y la lectura directa desde el navegador
 * falla cuando no hay sesión Supabase (p. ej. login admin de desarrollo).
 */
export async function GET(req: Request) {
  try {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(req.url);
    const sourceParam = searchParams.get('source');
    // Validación de entrada: solo se aceptan los valores conocidos.
    const source = sourceParam === 'cac' || sourceParam === 'px' ? sourceParam : null;

    // ARQ-03: columnas explícitas en lugar de `*` para reducir egress. Es el set
    // que consumen la bandeja CAC, el historial de recepción y el inbox backoffice
    // (verificado contra DbReception, BackofficeReception y los mapeos de la UI).
    // Se omiten columnas no consumidas por estas vistas (p. ej. photo_urls, version,
    // variance_*, expected_units_sap) que solo se usan en el snapshot PX.
    let query = supabase
      .from('receptions')
      .select(`
        id,
        source,
        guide_number,
        sap_document,
        carrier,
        received_by,
        reception_time,
        expected_units,
        received_units,
        evidence_url,
        notes,
        status,
        processed_guides,
        created_at,
        received_by_profile:received_by (id, full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(RECEPTIONS_SAFETY_LIMIT);

    if (source) {
      query = query.eq('source', source);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al cargar recepciones';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

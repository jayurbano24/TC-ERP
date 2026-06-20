import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';
import { filterEquipmentHistoryReceptions } from '@/app/(erp)/produccion/backoffice/history/filterEquipmentHistoryReceptions';
import { queryCacHistoryReceptions } from '@/lib/database/receptions';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const CACHE_TAG = 'cac-history-v1';
const CACHE_SECONDS = 60;

const loadCacHistory = unstable_cache(
  async () => {
    const supabase = getSupabaseServerClient();
    const raw = await queryCacHistoryReceptions(supabase);
    return filterEquipmentHistoryReceptions(raw);
  },
  [CACHE_TAG],
  { revalidate: CACHE_SECONDS, tags: [CACHE_TAG] }
);

/** Historial CAC con OS TC-XXX — service role + caché server-side (evita RLS y repeticiones lentas). */
export async function GET() {
  try {
    const data = await loadCacHistory();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': `private, max-age=${CACHE_SECONDS}, stale-while-revalidate=120`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al cargar historial CAC';
    console.error('cac-history API:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

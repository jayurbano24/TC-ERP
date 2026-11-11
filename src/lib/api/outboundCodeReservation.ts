import type { SupabaseClient } from '@supabase/supabase-js';

const OB_PREFIX_RE = /^(?:OB|MB|CS)-(\d+)$/i;

function parseObNumber(boxCode: string): number | null {
  const match = String(boxCode || '').trim().match(OB_PREFIX_RE);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  return Number.isFinite(num) ? num : null;
}

/** Mayor correlativo OB/MB/CS visible con service_role (sin límite de 1000 filas). */
export async function findMaxOutboundCorrelative(supabase: SupabaseClient): Promise<number> {
  let max = 0;
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('boxes')
      .select('box_code')
      .or('box_code.ilike.OB-%,box_code.ilike.MB-%,box_code.ilike.CS-%')
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`No se pudo leer correlativos Outbound: ${error.message}`);
    }

    const page = data ?? [];
    for (const row of page) {
      const num = parseObNumber(String(row.box_code ?? ''));
      if (num != null && num > max) max = num;
    }
    if (page.length < pageSize) break;
  }

  return max;
}

function formatObCode(n: number): string {
  return `OB-${String(n).padStart(6, '0')}`;
}

function isRpcMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === 'PGRST202' ||
    /404|not found|could not find the function|schema cache/i.test(msg)
  );
}

/** Un código: RPC oficial o reserva por escaneo + comprobación puntual. */
export async function reserveNextOutboundCode(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('next_outbound_code');
  if (!error && data != null && String(data).trim()) {
    return String(data).trim();
  }

  if (error && !isRpcMissing(error)) {
    throw new Error(
      error.message?.includes('NO_OUTBOUND_CODE')
        ? 'No hay correlativos OB disponibles.'
        : `next_outbound_code: ${error.message}`
    );
  }

  const max = await findMaxOutboundCorrelative(supabase);
  for (let candidate = max + 1; candidate <= max + 500; candidate++) {
    const code = formatObCode(candidate);
    const { count, error: existsErr } = await supabase
      .from('boxes')
      .select('id', { count: 'exact', head: true })
      .eq('box_code', code);

    if (existsErr) {
      throw new Error(`No se pudo verificar código ${code}: ${existsErr.message}`);
    }
    if ((count ?? 0) === 0) return code;
  }

  throw new Error('No se encontró un código OB libre tras revisar el catálogo.');
}

/** Planifica N códigos consecutivos (una sola pasada sobre la BD). */
export async function planNextOutboundCodes(
  supabase: SupabaseClient,
  count: number
): Promise<string[]> {
  if (count < 1) return [];

  const { data, error } = await supabase.rpc('next_outbound_code');
  if (!error && data != null && String(data).trim() && count === 1) {
    return [String(data).trim()];
  }

  if (error && !isRpcMissing(error) && count === 1) {
    throw new Error(`next_outbound_code: ${error.message}`);
  }

  const max = await findMaxOutboundCorrelative(supabase);
  const codes: string[] = [];
  let n = max + 1;

  while (codes.length < count && n <= max + count + 500) {
    const code = formatObCode(n);
    const { count: taken, error: existsErr } = await supabase
      .from('boxes')
      .select('id', { count: 'exact', head: true })
      .eq('box_code', code);

    if (existsErr) {
      throw new Error(`No se pudo verificar código ${code}: ${existsErr.message}`);
    }
    if ((taken ?? 0) === 0) codes.push(code);
    n += 1;
  }

  if (codes.length < count) {
    throw new Error(`Solo se pudieron planificar ${codes.length} de ${count} códigos OB.`);
  }

  return codes;
}

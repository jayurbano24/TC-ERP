/**
 * Guardas fail-closed para tests que tocan Supabase.
 * ALLOW_LIVE_DB_MUTATION=true NO autoriza mutar producción.
 */

const KNOWN_PRODUCTION_HOST_MARKERS = [
  'gpvocfptmsskgfpacadl.supabase.co',
] as const;

function readUrlCandidate(): string {
  return (
    process.env.ISOLATED_SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    ''
  );
}

export function isKnownProductionSupabaseUrl(url: string): boolean {
  const normalized = String(url || '').toLowerCase();
  if (!normalized) return false;
  return KNOWN_PRODUCTION_HOST_MARKERS.some((marker) => normalized.includes(marker));
}

/**
 * Autoriza mutaciones de prueba solo contra stack aislado explícito.
 * @throws Error si falta aislamiento o la URL apunta a producción.
 */
export function assertIsolatedSupabaseMutationAllowed(context: string): {
  url: string;
  serviceRoleKey: string;
} {
  const isolatedUrl = process.env.ISOLATED_SUPABASE_URL?.trim() || '';
  const isolatedKey =
    process.env.ISOLATED_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.ISOLATED_SUPABASE_SERVICE_KEY?.trim() ||
    '';
  const configuredUrl = readUrlCandidate();

  if (!isolatedUrl || !isolatedKey) {
    throw new Error(
      `[${context}] Bloqueado: se requiere ISOLATED_SUPABASE_URL + ISOLATED_SUPABASE_SERVICE_ROLE_KEY. ` +
        'ALLOW_LIVE_DB_MUTATION no autoriza mutaciones.',
    );
  }

  if (isKnownProductionSupabaseUrl(isolatedUrl) || isKnownProductionSupabaseUrl(configuredUrl)) {
    throw new Error(
      `[${context}] Bloqueado: URL de Supabase productiva detectada. Use solo recursos aislados/desechables.`,
    );
  }

  if (configuredUrl && configuredUrl.replace(/\/$/, '') !== isolatedUrl.replace(/\/$/, '')) {
    throw new Error(
      `[${context}] Bloqueado: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL no coincide con ISOLATED_SUPABASE_URL.`,
    );
  }

  return { url: isolatedUrl, serviceRoleKey: isolatedKey };
}

/** Lecturas de integración: exige aislamiento o falla cerrado (no usa .env.local productivo). */
export function assertIsolatedSupabaseReadAllowed(context: string): {
  url: string;
  serviceRoleKey: string;
} {
  return assertIsolatedSupabaseMutationAllowed(context);
}

import type { BackupSnapshot } from '../types';

/**
 * Intenta leer backups vía Management API si hay token.
 * Sin token: estado honesto not_configured con guía.
 */
export async function probeBackups(): Promise<BackupSnapshot> {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref =
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF?.trim() ||
    process.env.SUPABASE_PROJECT_REF?.trim() ||
    extractRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (!token || !ref) {
    return {
      status: 'not_configured',
      lastBackupAt: null,
      note: 'Configura SUPABASE_ACCESS_TOKEN + PROJECT_REF para listar backups, o revisa PITR en Dashboard → Database → Backups.',
      sizeBytes: null,
      durationNote: null,
    };
  }

  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/database/backups`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      return {
        status: 'degraded',
        lastBackupAt: null,
        note: `Management API backups HTTP ${res.status}. Verifica token/scopes.`,
        sizeBytes: null,
        durationNote: null,
      };
    }

    const json = (await res.json()) as unknown;
    const list = Array.isArray(json)
      ? json
      : Array.isArray((json as { backups?: unknown[] })?.backups)
        ? (json as { backups: unknown[] }).backups
        : [];

    if (list.length === 0) {
      return {
        status: 'ok',
        lastBackupAt: null,
        note: 'API OK · sin backups listados (PITR puede estar activo sin filas).',
        sizeBytes: null,
        durationNote: null,
      };
    }

    const first = list[0] as Record<string, unknown>;
    const lastBackupAt = String(
      first.inserted_at || first.created_at || first.updated_at || ''
    ) || null;
    const sizeBytes =
      typeof first.size === 'number'
        ? first.size
        : typeof first.bytes === 'number'
          ? first.bytes
          : null;

    return {
      status: 'ok',
      lastBackupAt,
      note: `${list.length} backup(s) vía Management API`,
      sizeBytes,
      durationNote: null,
    };
  } catch (e) {
    return {
      status: 'error',
      lastBackupAt: null,
      note: e instanceof Error ? e.message : 'Error consultando backups',
      sizeBytes: null,
      durationNote: null,
    };
  }
}

function extractRefFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname; // xxx.supabase.co
    const sub = host.split('.')[0];
    return sub && sub !== 'supabase' ? sub : null;
  } catch {
    return null;
  }
}

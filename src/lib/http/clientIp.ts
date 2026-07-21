/**
 * Resuelve la IP del cliente desde cabeceras de proxy (Vercel, Cloudflare, nginx).
 * Prefiere IPs no-loopback cuando el proxy encadena varias.
 */

function isLoopbackIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  return (
    v === '::1' ||
    v === '127.0.0.1' ||
    v === '0:0:0:0:0:0:0:1' ||
    v.startsWith('::ffff:127.') ||
    v === 'localhost'
  );
}

function unwrapMappedIpv4(ip: string): string {
  if (ip.toLowerCase().startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

function collectCandidateIps(headers: Headers): string[] {
  const keys = [
    'x-forwarded-for',
    'x-vercel-forwarded-for',
    'cf-connecting-ip',
    'true-client-ip',
    'x-real-ip',
    'x-client-ip',
    'fly-client-ip',
  ];
  const out: string[] = [];
  for (const key of keys) {
    const raw = headers.get(key);
    if (!raw) continue;
    for (const part of raw.split(',')) {
      const ip = unwrapMappedIpv4(part.trim());
      if (ip) out.push(ip);
    }
  }
  return out;
}

/** IP de red del cliente para persistir en user_sessions / rate-limit. */
export function getClientIpFromHeaders(headers: Headers): string {
  const candidates = collectCandidateIps(headers);
  const preferred = candidates.find((ip) => !isLoopbackIp(ip));
  return preferred || candidates[0] || 'unknown';
}

/** Etiqueta legible en UI (Localhost en dev, IPv4 mapeada, etc.). */
export function formatClientIpForDisplay(ip: string | null | undefined): string {
  if (!ip || ip === 'unknown' || ip === 'browser') return '—';
  const normalized = unwrapMappedIpv4(ip.trim());
  if (isLoopbackIp(normalized)) return 'Localhost (este equipo)';
  return normalized;
}

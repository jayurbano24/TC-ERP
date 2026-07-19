/** Extrae el Número SAP Base: `416104851-1` → `416104851`. */
export function sapDocumentBase(doc: string | null | undefined): string {
  const t = String(doc || '').trim();
  if (!t) return '';
  const m = t.match(/^(.+)-\d+$/);
  return m ? m[1] : t;
}

export function formatPersonName(raw: string): string {
  const name = raw.split('@')[0].trim();
  if (!name) return '---';
  if (name.includes(' ')) {
    return name
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/** Solo el nombre de quien clasificó en Backoffice (sin email, sin lista concatenada) */
export function getBackofficeClassifierName(rec: any, unitGuide?: string): string {
  const notes = rec.notes || '';

  if (unitGuide) {
    const gEscaped = unitGuide.replace(/[-'']/g, '\\$&');
    const perGuide = notes.match(
      new RegExp(
        `CLASIFICACIÓN \\(Guía [^)]*${gEscaped}[^)]*\\):[^\\n]*Por:\\s*([^\\n]+)`,
        'i'
      )
    );
    if (perGuide?.[1]) return formatPersonName(perGuide[1]);
  }

  const classifMatches = [...notes.matchAll(/CLASIFICACIÓN[^\n]*Por:\s*([^\n]+)/gi)];
  if (classifMatches.length > 0) {
    return formatPersonName(classifMatches[classifMatches.length - 1][1]);
  }

  return '---';
}

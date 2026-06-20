export function normalizeGuideKey(guide: string): string {
  return guide
    .trim()
    .replace(/[''`´]/g, "'")
    .toLowerCase();
}

export function findReceptionGuide(rec: any, unitGuide: string) {
  if (!unitGuide || unitGuide === '---') return null;
  const key = normalizeGuideKey(unitGuide);
  return (rec.reception_guides || []).find(
    (rg: any) => normalizeGuideKey(rg.guide_number || '') === key
  );
}

function getBackofficeDetailsSection(notes: string): string {
  if (!notes) return '';
  return notes.includes('--- DETALLES BACKOFFICE ---')
    ? notes.split('--- DETALLES BACKOFFICE ---')[1]?.split('--- LÍNEA DE TIEMPO')[0] || ''
    : notes;
}

function formatGuideDetailsBlock(header: string, body: string): string {
  const sapInHeader = header.match(/\|\s*SAP\s*(.+)$/i)?.[1]?.trim();
  return sapInHeader ? `Backoffice_SAP: ${sapInHeader}\n${body}` : body;
}

/** Bloque de detalles backoffice para una guía concreta (notas) */
export function extractGuideDetailsBlock(notes: string, unitGuide: string): string | null {
  if (!notes || !unitGuide || unitGuide === '---') return null;

  const normTarget = normalizeGuideKey(unitGuide);
  const detailsSection = getBackofficeDetailsSection(notes);

  const regex = /\[Guía ([^\]]+)\]([\s\S]*?)(?=\[Guía|---|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(detailsSection)) !== null) {
    const header = match[1];
    const guidePart = header.split('|')[0];
    const guideList = guidePart.split(',').map((g) => normalizeGuideKey(g.trim()));
    if (guideList.some((g) => g === normTarget)) {
      return formatGuideDetailsBlock(header, match[2]);
    }
  }
  return null;
}

/** Bloque por guía o, si falla, por coincidencia de series en el cuerpo */
export function extractGuideDetailsBlockForUnit(
  notes: string,
  unitGuide: string,
  unit: any[] = []
): string | null {
  if (!notes) return null;

  if (unitGuide && unitGuide !== '---') {
    const byGuide = extractGuideDetailsBlock(notes, unitGuide);
    if (byGuide) return byGuide;
  }

  const serials = unit
    .map((u) => u?.serial_number)
    .filter(Boolean)
    .map((s) => String(s).trim());
  if (!serials.length) return null;

  const detailsSection = getBackofficeDetailsSection(notes);
  const regex = /\[Guía ([^\]]+)\]([\s\S]*?)(?=\[Guía|---|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(detailsSection)) !== null) {
    if (serials.some((sn) => match![2].includes(sn))) {
      return formatGuideDetailsBlock(match[1], match[2]);
    }
  }
  return null;
}

export function findReceptionGuideById(rec: any, receptionGuideId?: string | null) {
  if (!receptionGuideId || !rec?.reception_guides?.length) return null;
  return rec.reception_guides.find((rg: any) => rg.id === receptionGuideId) || null;
}

export function sapDocsForReceptionGuide(rec: any, receptionGuideId?: string | null) {
  if (!receptionGuideId) return [];
  return (rec.sap_transfer_documents || []).filter(
    (d: any) => d.reception_guide_id === receptionGuideId
  );
}

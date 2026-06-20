export function parseReceptionGuideList(activeReception: {
  notes?: string;
  guide_number?: string;
}): string[] {
  const rawNotes = activeReception.notes || '';
  const cleanNotes = rawNotes
    .split('---')[0]
    .split('Backoffice_')[0]
    .split('Guías Procesadas:')[0];

  const rawGuideNumber = activeReception.guide_number || '';
  const fallbackGuides = rawGuideNumber.split(/[\\/,]/).map((g) => g.trim()).filter(Boolean);
  const guiasListString = cleanNotes?.split('Guías: ')[1]?.split('\n')[0];
  return guiasListString
    ? guiasListString.split(/[\\/,]/).map((g: string) => g.trim()).filter(Boolean)
    : fallbackGuides.length > 0
      ? fallbackGuides
      : [rawGuideNumber];
}

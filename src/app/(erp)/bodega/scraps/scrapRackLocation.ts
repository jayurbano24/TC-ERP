/** Ubicación física dentro de Bodega SCRAPS sin salir del inventario SCRAP. */

const SCRAP_PREFIX = 'SCRAP';

export function formatScrapRackLocation(rackNum: string, rackNivel: string, rackPosicion: string): string {
  const rn = rackNum.trim().toUpperCase() || 'S/N';
  const rnl = rackNivel.trim().toUpperCase() || '0';
  const rp = rackPosicion.trim().toUpperCase() || 'S/P';
  return `${SCRAP_PREFIX} - RACK-${rn} - NIVEL-${rnl} - POSICION-${rp}`;
}

/**
 * Parsea `SCRAP`, `SCRAPS` o `SCRAP - RACK-A - NIVEL-1 - POSICION-2`
 * (también acepta el formato de Bodega Central sin prefijo SCRAP).
 */
export function parseScrapRackParts(rack: string | null | undefined): {
  rackNum: string;
  rackNivel: string;
  rackPosicion: string;
  hasDetail: boolean;
  displayParts: string[];
} {
  const raw = String(rack || '').trim();
  if (!raw || raw.toUpperCase() === 'SIN RACK') {
    return { rackNum: '', rackNivel: '', rackPosicion: '', hasDetail: false, displayParts: [] };
  }

  let working = raw;
  const upper = raw.toUpperCase();
  if (upper === 'SCRAP' || upper === 'SCRAPS') {
    return {
      rackNum: '',
      rackNivel: '',
      rackPosicion: '',
      hasDetail: false,
      displayParts: [upper === 'SCRAPS' ? 'SCRAPS' : 'SCRAP'],
    };
  }

  if (upper.startsWith('SCRAP - ') || upper.startsWith('SCRAPS - ')) {
    working = raw.replace(/^SCRAPS?\s*-\s*/i, '');
  }

  const parts = working.split(' - ').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const rackNum = parts[0].replace(/^RACK-/i, '');
    const rackNivel = parts[1].replace(/^NIVEL-/i, '');
    const rackPosicion = parts[2].replace(/^POSICION-/i, '');
    return {
      rackNum,
      rackNivel,
      rackPosicion,
      hasDetail: true,
      displayParts: ['SCRAP', rackNum, rackNivel, rackPosicion],
    };
  }

  return {
    rackNum: working.replace(/^RACK-/i, ''),
    rackNivel: '',
    rackPosicion: '',
    hasDetail: false,
    displayParts: [working],
  };
}

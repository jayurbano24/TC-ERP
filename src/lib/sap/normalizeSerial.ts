/**
 * Normaliza números de serie para cruce SAP ↔ TC.
 * Debe usarse en parseo de Excel, match, consulta forense e inserts.
 */
export function normalizeSerial(valor: unknown): string {
  if (valor === null || valor === undefined) return '';

  let str = String(valor);

  // Excel a veces entrega notación científica (p.ej. 4.8575443803E+15)
  if (/^\d+\.?\d*[eE][+\-]?\d+$/.test(str.trim())) {
    try {
      const n = Number(str);
      if (Number.isFinite(n)) {
        str = n.toLocaleString('fullwide', { useGrouping: false });
      }
    } catch {
      // keep original
    }
  }

  return str
    .trim()
    // Excel / OCR a veces antepone + ( ) - al exportar o pegar
    .replace(/^[\uFEFF\+]+/, '')
    .replace(/^[(\[{]+/, '')
    .replace(/[)\]}]+$/, '')
    .replace(/[\r\n\t]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .normalize('NFKC');
}

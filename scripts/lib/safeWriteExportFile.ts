import fs from 'node:fs';
import path from 'node:path';

function isBusyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'EBUSY' || code === 'EPERM';
}

/**
 * Escribe el Excel evitando fallo si el usuario lo tiene abierto en Excel.
 * 1) Intenta ruta canónica
 * 2) Reintentos cortos
 * 3) Copia con timestamp si sigue bloqueado
 */
export function safeWriteExportFile(targetPath: string, buffer: Buffer): string {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });

  const attempts = 5;
  for (let i = 0; i < attempts; i++) {
    try {
      fs.writeFileSync(targetPath, buffer);
      return targetPath;
    } catch (err) {
      if (!isBusyError(err) || i === attempts - 1) break;
      busyWait(400 * (i + 1));
    }
  }

  const base = path.basename(targetPath, path.extname(targetPath));
  const ext = path.extname(targetPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const altPath = path.join(dir, `${base}_${stamp}${ext}`);

  fs.writeFileSync(altPath, buffer);
  console.warn('');
  console.warn('[export] El archivo destino estaba abierto (Excel). Guardado como:');
  console.warn(altPath);
  console.warn('Cierre el .xlsx anterior y vuelva a exportar si necesita sobrescribir.');
  console.warn('');
  return altPath;
}

function busyWait(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

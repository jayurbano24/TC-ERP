/**
 * Descarga pack buffalo_sc (SCRFD + MobileFaceNet ArcFace) desde GitHub Releases
 * y copia WASM de onnxruntime-web a public/onnx.
 *
 * Uso: node scripts/download-insightface-models.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const modelDir = path.join(root, 'public', 'models', 'insightface');
const onnxDir = path.join(root, 'public', 'onnx');
const ZIP_URL =
  'https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const go = (u, redirects = 0) => {
      https
        .get(
          u,
          {
            headers: {
              'User-Agent': 'TC-ERP-insightface-downloader/1.0',
              Accept: '*/*',
            },
          },
          (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              if (redirects > 8) return reject(new Error('Too many redirects'));
              res.resume();
              return go(res.headers.location, redirects + 1);
            }
            if (res.statusCode !== 200) {
              file.close();
              fs.unlink(dest, () => undefined);
              return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
            }
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve()));
          },
        )
        .on('error', (err) => {
          file.close();
          fs.unlink(dest, () => undefined);
          reject(err);
        });
    };
    go(url);
  });
}

function extractZip(zipPath, destDir) {
  // Windows: Expand-Archive. Linux/CI (Vercel): unzip o python3 -m zipfile.
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -Force -Path "${zipPath}" -DestinationPath "${destDir}"`],
      { stdio: 'inherit' },
    );
    return;
  }

  try {
    execFileSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'inherit' });
    return;
  } catch {
    // continue
  }

  try {
    execFileSync('python3', ['-m', 'zipfile', '-e', zipPath, destDir], { stdio: 'inherit' });
    return;
  } catch {
    // continue
  }

  execFileSync('python', ['-m', 'zipfile', '-e', zipPath, destDir], { stdio: 'inherit' });
}

function findAndCopyModels(extractRoot) {
  const needed = ['det_500m.onnx', 'w600k_mbf.onnx'];
  const found = {};

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (needed.includes(entry.name)) found[entry.name] = full;
    }
  }
  walk(extractRoot);

  for (const name of needed) {
    if (!found[name]) throw new Error(`No se encontró ${name} en el zip`);
    const dest = path.join(modelDir, name);
    fs.copyFileSync(found[name], dest);
    console.log('Installed', name, fs.statSync(dest).size, 'bytes');
  }
}

async function copyOrtWasm() {
  ensureDir(onnxDir);
  const srcDir = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
  if (!fs.existsSync(srcDir)) {
    console.warn('onnxruntime-web no instalado; omitiendo copia WASM');
    return;
  }
  const files = fs.readdirSync(srcDir).filter(
    (f) => f.endsWith('.wasm') || (f.endsWith('.mjs') && f.includes('wasm')),
  );
  for (const f of files) {
    fs.copyFileSync(path.join(srcDir, f), path.join(onnxDir, f));
    console.log('Copied', f);
  }
}

async function main() {
  ensureDir(modelDir);
  const det = path.join(modelDir, 'det_500m.onnx');
  const rec = path.join(modelDir, 'w600k_mbf.onnx');
  if (fs.existsSync(det) && fs.existsSync(rec) && fs.statSync(rec).size > 1_000_000) {
    console.log('Models already present');
  } else {
    const tmpDir = path.join(root, '.tmp-insightface');
    ensureDir(tmpDir);
    const zipPath = path.join(tmpDir, 'buffalo_sc.zip');
    console.log('Downloading buffalo_sc.zip ...');
    try {
      await download(ZIP_URL, zipPath);
      console.log('Extracting...');
      extractZip(zipPath, tmpDir);
      findAndCopyModels(tmpDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // GitHub Releases a veces responde 5xx; no tumbar el build de ERP/cron.
      console.warn('[insightface] download failed:', msg);
      console.warn(
        '[insightface] continuing build without models (kiosco facial degradado hasta reintento)',
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
  await copyOrtWasm();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

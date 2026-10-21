# Política de hash del paquete v2.2.0

## Autoridad

| Fase | Fuente de bytes | Uso |
|------|-----------------|-----|
| **Preparación** (`npm run supabase:upgrade:prepare-manifest`) | Blob del **índice Git** (`git show :path`) | Escribir `PACKAGE-MANIFEST.sha256.json` |
| **Verificación** (`npm run supabase:upgrade:validate-package-index`) | Bytes del **export** (`materialize-git-index-export.mjs`, mismo blob que índice) | Comparar SHA-256 archivo a archivo |
| **Fixtures** | Mismo que verificación | `fixtures/*.dump` versionados; hash en manifiestos de prueba |

## LF / CRLF

- Archivos de texto del paquete: `.gitattributes` (`*.sql`, `*.mjs`, `*.json`, `*.md` → `eol=lf` donde aplique).
- **No** normalizar en hash: el digest refleja bytes entregados por Git/export.
- No usar `checkout-index` para verify en Windows (smudge CRLF); el export materializa con `git show :path`.

## Regeneración

- Solo `scripts/upgrade/prepare-package-manifest.mjs` escribe el manifiesto versionado.
- `verify-package-manifest.mjs` **nunca** escribe disco.

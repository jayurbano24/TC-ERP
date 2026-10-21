# Runbook — validación upgrade/recovery → `a14b4ce`

## Referencias duales (obligatorias)

| Rol | Commit | Uso |
|-----|--------|-----|
| **Aplicación objetivo** | `a14b4ce22a6d53514fd69392c3b32e7016d00e5e` | Migraciones en `supabase/migrations` y esquema final |
| **Paquete de validación** | `validationPackageCommit` en `PACKAGE-MANIFEST.sha256.json` | Scripts, manifiesto, fixtures, gates SQL |

Checkout: debe contener **ambos** (rama/commit que incluye el paquete v2.2.x sobre la línea que apunta a `a14b4ce`).

## Puertos protegidos

No usar `54322` (`tc-erp-local`) ni `54332` (verify). Stack upgrade: **54342** (`tc-erp-isolated-upgrade`).

## Preparación del paquete (desde `web/`)

1. Actualizar `PACKAGE-FILE-LIST.json` si hay archivos nuevos.
2. `git add` de todo el alcance del paquete (hashes = **bytes del índice Git**, ver `HASH-POLICY.md`).
3. `npm run supabase:upgrade:prepare-manifest`
4. `npm run supabase:upgrade:validate-package-index` (export + verify + tests **desde export**).

## Selección de migraciones de aplicación (sin cambios ajenos)

- El **target** es `target-migration-index.json` (lista fijada al commit **`a14b4ce`**, regenerable con `npm run supabase:upgrade:sync-migration-index`).
- El **plan** = target − `supabase_migrations.schema_migrations` extraído **después** del restore (`extract-schema-migrations.mjs`).
- Solo entradas con decisión **`apply`** en `migration-decisions.json` entran en `approvedPlan.toApply`.
- `skip_equivalent` / `skip_accept_existing` en migraciones **pendientes** → **bloqueo** (el CLI las aplicaría si el archivo sigue en `migrations/`).
- El runner copia **únicamente** `toApply` a staging y enlaza el workdir a esa carpeta (`run-approved-migrations.mjs`).

## Arranque compatible con Supabase (sin migraciones de app pre-restore)

1. `supabase-isolated-upgrade-init.ps1` — solo `config.toml` de plataforma (**sin** junction a `supabase/migrations`).
2. `supabase start` (workdir upgrade).
3. `assert-pre-restore-database.mjs` — tablas de aplicación vacías/ausentes.
4. `pg_restore` según manifiesto (`restoreOrder` si hay varios dumps).
5. Extraer historial → plan → evidencia `before`.
6. Enlazar migraciones de staging → `supabase migration up` solo tras revalidación del plan.

## Evidencia

Fases separadas: `before`, `after`, `recovered` (no sobrescribir `after` en recovery drill).

Fingerprints completos + conjuntos de IDs (`export-evidence.mjs` / `compare-evidence.mjs`).

Inventario de objetos: `object-inventory.mjs` / `compare-object-inventory.mjs`.

## Estado de aprobación

Pasar `validate-package-index` **no** aprueba el ensayo end-to-end. Sigue bloqueado hasta copia anonimizada autorizada + ejecución completa documentada.

# Validación: TypeScript zero (incremento tipos)

Fecha: 2026-10-27

## Resumen

| Métrica | Antes | Después |
|--------|-------|---------|
| `npx tsc --noEmit --pretty false` | **111 errores** (exit 2) | **0 errores** (exit 0) |
| `npm run check:architecture` | — | **0 violaciones nuevas** (4 grandfathered) |
| `npm run build` | — | **OK** (exit 0) |
| `git diff --check` | — | **OK** (exit 0) |
| `npm test` (suite global) | — | **No declarada aprobada** — 3 fallos WIP previo (ver §Tests investigados) |

Baseline: `web/.tmp-typescript-debt.txt` (111 líneas).

## 1. Tests investigados (3 fallos)

Comando:

```powershell
npx vitest run `
  src/modules/backoffice/prediagnostico/validatePrediagnostico.test.ts `
  src/modules/backoffice/prediagnostico/prediagnosticoService.test.ts `
  src/scripts/export-prediagnostico-all.test.ts `
  --reporter=verbose
```

| Test | Esperado | Recibido | ¿Causado por TS Zero? | Clasificación |
|------|----------|----------|----------------------|---------------|
| `validatePrediagnostico > exige observaciones cuando el dictamen es irreparable` | `errors.length > 0` con `notes: ''` / `'   '` | `0` errores | **No** | WIP incompleto en `23af06c`: se añadieron constante `IRREPARABLE_NOTES_REQUIRED_MESSAGE` + tests, **sin** lógica en `validatePrediagnostico()` |
| `savePrediagnostico > no guarda irreparable sin razones en observaciones` | `rejects` `ValidationException` | `resolves` registro | **No** | Mismo hueco: `savePrediagnostico` delega en `validatePrediagnostico` que no exige notes |
| `export prediagnostico all > escribe PREDIAGNOSTICO_EQUIPOS_todos.xlsx en dist` | Excel en `dist/` vía `generateReportHex` + Supabase | Hang / fallo de integración (timeout 600s, red/Supabase) | **No** | Test de integración live; no es deuda TypeScript |

**Decisión DoD:** no se corrigió la regla de negocio irreparable dentro de este incremento (tipos-only). No se modificaron las pruebas para ponerlas en verde. La suite global **no** se declara aprobada.

Archivos responsables del desalineamiento (commit `23af06c fix(backoffice): devolución, pre-diag export y certificados ONT`):

- `src/modules/backoffice/prediagnostico/validatePrediagnostico.ts` (constante sin uso)
- `src/modules/backoffice/prediagnostico/validatePrediagnostico.test.ts`
- `src/modules/backoffice/prediagnostico/prediagnosticoService.test.ts`
- `src/scripts/export-prediagnostico-all.test.ts` (dependencia de red)

## 2. Errores TS corregidos por lote

| Lote | Módulo | Causa principal | Commit |
|------|--------|-----------------|--------|
| A | Configuración | Supabase nullable | `ff560b8` |
| B | Catálogo bodega | `CatalogRow` sin `series_count` / `digits_per_series` | `3ccb3d3` |
| C | Inventario + despacho | Proyecciones series, null vs undefined, JsBarcode | `3455186` |
| D | Reporting | `PromiseLike` fetchPaged, excludeBackfill | `4044a6d` |
| E | SAP transfer tests | Firmas mock `from(table?)` | `6a10e12` |
| F | Scripts prediag | Campo `rates` obsoleto | `f73cf76` |
| G | Shared + warehouse API | Type guards `isRowWithId` | `4c043fd` |
| H | App restante | Dashboard SAP, RRHH, ONT, middleware, PX, returns archive | `693699f` |
| Docs | Evidencia | Este documento | *(este commit)* |

## 3. Clasificación de archivos (staging)

| Archivo | Lote | Solo TypeScript | Contiene WIP ajeno | Acción |
|---------|------|-----------------|--------------------|--------|
| `configuracion/page.tsx` | A | Guard nullable | Sí (`qc_checklist`) | Staging aislado (checkout HEAD + guard + restore WIP) |
| `catalogLookups.ts` | B | Sí | No | `git add` por ruta |
| `inventorySeriesOrder.ts` | C | Sí | No | por ruta |
| `equipmentSerialSlots.ts` | C | Sí | No | por ruta |
| `despacho/page.tsx`, `despachoReads.ts`, `scraps/page.tsx`, `printOutboundLabel.ts` | C | Sí | No | por ruta |
| `warehouse.ts` | C | Anotación `(id: string)` | Sí (`OBSOLETO` rack) | Solo hunk tipado; WIP restaurado |
| Reporting providers + HistoryToolbar/Tab/export/actions | D | Sí | No | por ruta |
| `classify-equipment-batch-runner.test.ts` | E | Sí | No | por ruta |
| `run-prediagnostico-backfill-apply.test.ts` | F | Sí | No | por ruta |
| `rowGuards.ts`, enrich + warehouse API routes | G | Sí | No | por ruta |
| integracion-sap, RRHH, ont-runs, middleware, PX store, returnsArchive, etc. | H | Sí | No | por ruta |
| `resolveAuthEmailRedirect.test.ts` | H | `vi.stubEnv` NODE_ENV | Sí (tests host efímero) | Solo stubEnv aislado; WIP restaurado |
| `taller/page.tsx` | — | Parcial | **Sí** (~572 líneas) | **Excluido** |
| `partsService.ts` | — | Parcial analytics | **Sí** (`returnUnusedGoodPart`) | **Excluido** |
| `logistica/devoluciones/page.tsx` | — | Import archive | **Sí** (undo/archive UX) | **Excluido** |
| `resolveAuthEmailRedirect.ts` | — | — | **Sí** (hosts efímeros) | **Excluido** |
| `configuracion/components/ConfigModal.tsx` | — | — | **Sí** | **Excluido** |
| `.tmp-typescript-debt.txt`, `dist/`, `.supabase-isolated*` | — | — | N/A | **Excluidos** |

Con WIP en disco + commits de tipos, `tsc` sigue en **0**.

## 4. Controles ejecutados

```powershell
npx tsc --noEmit --pretty false          # 0
npm run check:architecture               # 0 new violations
npm run build                            # OK
git diff --check                         # OK
```

### ESLint (archivos del incremento, sin autofix)

Lista representativa de paths committed (lotes A–H). Ejecutar:

```powershell
npx eslint --max-warnings 0 <paths-del-incremento>
```

*(Si el proyecto no tiene script eslint dedicado por archivo, usar el CLI local del package.)*

## 5. Commits creados

1. `ff560b8` — `fix(types): harden configuracion contracts`
2. `3ccb3d3` — `fix(types): align warehouse catalog projections`
3. `3455186` — `fix(types): align inventory and dispatch projections`
4. `4044a6d` — `fix(types): complete reporting query contracts`
5. `6a10e12` — `fix(types): align sap transfer test doubles`
6. `f73cf76` — `fix(types): synchronize prediagnostico script contracts`
7. `4c043fd` — `fix(types): validate shared infrastructure results`
8. `693699f` — `fix(types): close remaining application type errors`
9. *(pendiente)* `docs(quality): record TypeScript zero validation`

## 6. Estado del working tree tras commits

- TypeScript: **0**
- Archivos WIP ajenos: siguen modificados / untracked (taller, parts unused-return, devoluciones UX, auth ephemeral, qc_checklist, workshop, etc.)
- Suite global: **no aprobada** por los 3 tests de §1

## 7. Riesgos / deuda no TypeScript

1. Completar regla `irreparable → notes obligatorias` (implementación + UI) o retirar tests/constante huérfanos en un incremento de negocio.
2. Export Excel prediagnóstico: test de integración; considerar skip/condición de red o job ETL separado.
3. Staging pendiente de WIP grande fuera de este incremento.

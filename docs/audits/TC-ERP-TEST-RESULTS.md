# TC-ERP — Resultados de Pruebas y Control de Calidad

**Fecha:** 2026-10-29  
**Commit Evaluado:** `91a1bc8af52240d338b7939e35662ed5d28e03d0`  
**Responsable:** Senior QA Automation Engineer & Software Architect  

---

## 1. Tabla Resumen de Comprobaciones

| Prueba / Comprobación | Comando Ejecutado | Resultado | Detalle y Causa Raíz |
| :--- | :--- | :---: | :--- |
| **TypeScript Typecheck** | `npx tsc --noEmit` | **FAIL** | Errores en `web/.next/dev/types/routes.d.ts` (TS1128, TS1109, TS1160). La carpeta untracked de recuperación `web/` no está en `exclude` de `tsconfig.json`. |
| **Arquitectura Modular** | `node scripts/check-architecture.js` | **PASS** | 1,157 archivos analizados. 4 violaciones grandfathered heredadas; **0 nuevas violaciones**. |
| **Linting Estático** | `npx eslint src/modules/workshop` | **FAIL** | 42 problemas (40 errores `@typescript-eslint/no-explicit-any`, 2 warnings `@typescript-eslint/no-unused-vars` en `workshopTasksService.ts`). |
| **Suite de Pruebas Unitarias** | `npm run test:unit` | **BLOCKED** | **CRITICAL:** Detectado script `src/scripts/run-prediagnostico-backfill-apply.test.ts` ejecutando mutaciones reales sobre base productiva (`dryRun: false`). Cancelado inmediatamente para proteger integridad. |
| **Pruebas Unitarias de Taller** | `vitest run src/modules/workshop` | **PASS** | 5 archivos de prueba ejecutados: `workshopOperateService.test.ts` (9 tests), `workshopStagePrerequisites.test.ts` (5 tests), `workshopDiagnosticRepairPolicy.test.ts` (casos de catálogo y allowed_outcomes). Todos verdes. |
| **Smoke Prediagnóstico** | `test:integration:prediagnostico` | **SKIPPED** | Configurado smoke limitado a 100 registros (~19s). La exportación de carga completa (~87,000 filas) fue omitida para evitar saturación del pool de conexiones. |
| **Build de Producción** | `npm run build` | **SKIPPED** | Supeditado a la resolución previa de los errores de `tsc` y exclusión de artefactos de recuperación. |

---

## 2. Detalle de Comprobaciones

### 2.1 TypeScript Typecheck (`npx tsc --noEmit`)
- **Evidencia del Error:**
  ```text
  web/.next/dev/types/routes.d.ts(263,4): error TS1128: Declaration or statement expected.
  web/.next/dev/types/routes.d.ts(264,4): error TS1109: Expression expected.
  web/.next/dev/types/routes.d.ts(271,1): error TS1160: Unterminated template literal.
  ```
- **Causa Raíz:** En la raíz del repositorio existe un directorio untracked `web/` (creado como réplica durante un incidente de recuperación de `.git`). El archivo `tsconfig.json` incluye `"**/*.ts"` y `"**/*.tsx"`, y en `"exclude"` solo declara `["node_modules", "scratch"]`. Por tanto, `tsc` compila los tipos generados corruptos dentro de `web/.next/`.
- **Acción Requerida:** Actualizar `tsconfig.json` para excluir `"web"` y `".next"`, o retirar la carpeta de recuperación fuera del árbol del proyecto.

### 2.2 ESLint y Violación de Reglas de Tipado
- **Evidencia en `src/modules/workshop/server/workshopTasksService.ts`:**
  - 40 incidencias de `@typescript-eslint/no-explicit-any`.
  - Ejemplo: `supabase: any`, `record: any`, casts forzados de `as any`.
- **Causa Raíz:** Acumulación de deuda técnica en consultas dinámicas de la cola de taller.
- **Acción Requerida:** Reemplazar los usos de `any` por tipos e interfaces definidos en `src/modules/workshop/domain/` y schemas de Zod.

### 2.3 Bloqueo de `npm run test:unit` por Mutación de Datos Vivos
- **Evidencia de Ejecución:**
  ```text
  stdout | src/scripts/run-prediagnostico-backfill-apply.test.ts
  ◇ injected env (22) from .env.local
  [prediag-backfill] inicio · cutoff 2027-01-01T06:00:00.000Z · lote 500 · max lotes 500
  ```
- **Causa Raíz:** El archivo tiene extensión `.test.ts` dentro de `src/scripts/`. Vitest lo ejecuta por convención por defecto en `test:unit`. Al cargar `.env.local`, utiliza el `SUPABASE_SERVICE_ROLE_KEY` y ejecuta `runPrediagnosticoBackfillAll(supabase, { dryRun: false, ... })`.
- **Acción Requerida:** 
  1. Renombrar el script o moverlo fuera de la ruta de búsqueda de Vitest (e.g. `scripts/tasks/`).
  2. En `package.json`, definir:
     ```json
     "test:unit": "vitest run --exclude 'src/scripts/**'"
     ```
  3. Agregar una condición estricta en el código que requiera `process.env.ALLOW_LIVE_DB_MUTATION === 'true'`.

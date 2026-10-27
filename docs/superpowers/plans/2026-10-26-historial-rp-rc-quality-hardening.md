# Historial RP/RC and Quality Hardening Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar la regla RP/RC entre Control de Calidad y el Motor de Reportes, y dejar el cambio verificable mediante pruebas, TypeScript, lint arquitectónico y una liberación controlada.

**Architecture:** La decisión RP/RC vivirá en un módulo de dominio puro y único. Los adaptadores de Taller y Reporting recolectarán evidencia (`reparación agregada` y `paso por Reacondicionado`) y llamarán esa misma interfaz; ninguna pantalla o exportador volverá a inferir el tratamiento desde el estado actual.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Supabase/Postgres, Vitest, ESLint, ExcelJS.

**Spec:** Regla confirmada el 2026-10-26: una reparación realmente agregada determina `RP`, aunque el equipo haya estado antes o después en Reacondicionado; `RC` aplica únicamente si pasó por Reacondicionado y no tiene reparación agregada.

## Global Constraints

- No inferir `RP` por visitar el área Reparación; debe existir evidencia de reparación agregada.
- Si existe evidencia de reparación agregada, `RP` prevalece sobre `RC` sin importar el orden del recorrido.
- No modificar ni eliminar historial operativo para producir el reporte.
- Pantalla, CSV y XLSX deben consumir el mismo valor resuelto.
- No actualizar el baseline arquitectónico para esconder violaciones nuevas.
- Cada incremento debe tener prueba roja, implementación mínima, prueba verde y commit independiente.

---

## Mapa de archivos

- Crear `src/modules/workshop/domain/workshopTreatment.ts`: política pura RP/RC.
- Crear `src/modules/workshop/domain/workshopTreatment.test.ts`: matriz completa de reglas.
- Modificar `src/modules/workshop/shared/workshopSeriesDisplay.ts`: formateo delegado a la política.
- Modificar `src/modules/workshop/server/workshopTasksService.ts`: recolección robusta de evidencia para QC.
- Crear `src/modules/workshop/server/workshopTreatmentEvidence.ts`: adapter paginado de catálogos y auditoría.
- Crear `src/modules/workshop/server/workshopTreatmentEvidence.test.ts`: pruebas del adapter.
- Modificar `src/modules/reporting/infrastructure/providers/ops-monthly-tech-report.provider.ts`: dejar de clasificar por `current_status`.
- Crear `src/modules/reporting/infrastructure/providers/ops-monthly-tech-treatment.test.ts`: contrato del Motor de Reportes.
- Modificar `src/modules/reporting/infrastructure/providers/cenam-refurbished-report.provider.ts` solo si duplica la clasificación; debe consumir la misma política.
- Modificar `docs/modules/reporting/report-catalog.md`: documentar semántica y unidad de conteo.

### Task 1: Congelar el contrato funcional y la unidad de conteo

**Files:**
- Modify: `docs/modules/reporting/report-catalog.md`

**Interfaces:**
- Produces: definición inequívoca de `Historial`, `RP`, `RC`, evidencia y unidad de conteo.

- [x] Verificar unidad de conteo: **equipo (`series.id`)**, no OS. Decisión registrada en `docs/modules/reporting/report-catalog.md` (§ `OPERACIONES_MENSUAL_TECNOLOGIA`). Motivo: la regla de negocio está formulada por equipo; contar por OS altera totales cuando una OS tiene recorridos mixtos.
- [x] Documentar esta matriz:

| Evidencia | Historial/Tratamiento |
|---|---|
| Reparación agregada, con o sin RC | RP |
| Sin reparación agregada, con paso por RC | RC |
| Sin reparación agregada y sin RC | vacío/no clasificado |
| Solo visita al área Reparación, luego RC | RC |

- [x] Documentar que `current_status` sirve para ubicación operativa, no para determinar RP/RC.
- [ ] Commit: `docs(reporting): define RP RC treatment contract`.

### Task 2: Crear la política de dominio única

**Files:**
- Create: `src/modules/workshop/domain/workshopTreatment.ts`
- Create: `src/modules/workshop/domain/workshopTreatment.test.ts`

**Interfaces:**
- Produces: `resolveWorkshopTreatment(evidence: WorkshopTreatmentEvidence): 'RP' | 'RC' | null`.

- [ ] Escribir pruebas parametrizadas para los cuatro casos de la matriz y para valores booleanos falsos.
- [ ] Ejecutar `npx vitest run src/modules/workshop/domain/workshopTreatment.test.ts`; debe fallar porque el módulo aún no existe.
- [ ] Implementar:

```ts
export type WorkshopTreatment = 'RP' | 'RC';

export type WorkshopTreatmentEvidence = {
  hasAddedRepair: boolean;
  passedReacondicionado: boolean;
};

export function resolveWorkshopTreatment(
  evidence: WorkshopTreatmentEvidence,
): WorkshopTreatment | null {
  if (evidence.hasAddedRepair) return 'RP';
  if (evidence.passedReacondicionado) return 'RC';
  return null;
}
```

- [ ] Reejecutar la prueba; debe pasar.
- [ ] Commit: `feat(workshop): centralize RP RC treatment policy`.

### Task 3: Adaptar Control de Calidad a la política única

**Files:**
- Modify: `src/modules/workshop/shared/workshopSeriesDisplay.ts`
- Modify: `src/modules/workshop/shared/workshopSeriesDisplay.historial.test.ts`
- Modify: `src/app/(erp)/produccion/taller/components/workshopQueueTableColumns.tsx`

**Interfaces:**
- Consumes: `resolveWorkshopTreatment`.
- Produces: columna `Historial` con `RP`, `RC` o `—`.

- [ ] Cambiar `formatWorkshopStageHistoryLabel` para delegar la decisión en `resolveWorkshopTreatment`; conservar temporalmente su interfaz para no romper consumidores.
- [ ] Mantener pruebas de los recorridos `RC → Reparación agregada` y `Reparación agregada → RC`.
- [ ] Agregar una prueba del render/filtro que confirme que el valor visible y el valor filtrable son iguales.
- [ ] Ejecutar las pruebas de `workshopSeriesDisplay` y `workshopQueueColumnFilters`.
- [ ] Commit: `refactor(qc): use canonical treatment policy for Historial`.

### Task 4: Hacer confiable la evidencia histórica

**Files:**
- Create: `src/modules/workshop/server/workshopTreatmentEvidence.ts`
- Create: `src/modules/workshop/server/workshopTreatmentEvidence.test.ts`
- Modify: `src/modules/workshop/server/workshopTasksService.ts`

**Interfaces:**
- Produces: `loadWorkshopTreatmentEvidence(supabase, seriesIds): Promise<Map<string, WorkshopTreatmentEvidence>>`.

- [ ] Escribir pruebas que simulen más de 4,000 auditorías, varias páginas, error de consulta y reparación presente solo en auditoría histórica.
- [ ] Extraer la consulta actual de `enrichWorkshopStageHistoryFlags` a un adapter dedicado.
- [ ] Paginar explícitamente por `created_at,id` o por rangos estables; eliminar el límite global silencioso de 4,000.
- [ ] Ante error, devolver un error tipado y registrar contexto/correlation ID; no degradar silenciosamente a `RC`.
- [ ] Reconocer reparación únicamente cuando `current_repairs` tenga IDs válidos o una auditoría de reparación contenga IDs extraídos por `extractWorkshopRepairIds`.
- [ ] Reemplazar `any[]` en la nueva interfaz por tipos concretos; no ampliar la deuda de tipos del archivo legado.
- [ ] Ejecutar las pruebas del adapter y las pruebas de tareas de Taller.
- [ ] Commit: `fix(workshop): load complete RP RC historical evidence`.

### Task 5: Corregir el Motor de Reportes

**Files:**
- Modify: `src/modules/reporting/infrastructure/providers/ops-monthly-tech-report.provider.ts`
- Create: `src/modules/reporting/infrastructure/providers/ops-monthly-tech-treatment.test.ts`
- Modify: `src/modules/reporting/infrastructure/providers/cenam-refurbished-report.provider.ts` si aplica.

**Interfaces:**
- Consumes: `resolveWorkshopTreatment` y el adapter de evidencia.
- Produces: categorías mutuamente excluyentes `reparado` o `reacondicionado`.

- [ ] Escribir una prueba que demuestre el fallo actual: `ready_to_dispatch` + reparación agregada debe producir `RP`, no `RC`.
- [ ] Escribir pruebas para `RC → reparación agregada`, `reparación agregada → RC`, solo RC y visita a Reparación sin reparación agregada.
- [ ] Sustituir la inferencia basada en `in_validation`, `in_central_warehouse` y `ready_to_dispatch` por evidencia histórica y `resolveWorkshopTreatment`.
- [ ] Garantizar exclusión: una misma unidad de conteo no puede incrementar simultáneamente Reparado y Reacondicionado.
- [ ] Aplicar la unidad de conteo aprobada en Task 1 sin cambiarla implícitamente.
- [ ] Confirmar que detalle, resumen, CSV y XLSX usan la misma fila resuelta por el provider.
- [ ] Ejecutar pruebas del provider, exportadores CSV/XLSX y CENAM.
- [ ] Commit: `fix(reporting): classify RP RC from repair evidence`.

### Task 6: Cerrar fallos de compilación y arquitectura relacionados

**Files:**
- Modify: `src/modules/reporting/infrastructure/providers/ops-monthly-tech-report.provider.ts`
- Modify: `src/modules/workshop/server/workshopTasksService.ts`
- Modify: archivos señalados por `npm run check:architecture` en commits separados.

**Interfaces:**
- Produces: cambio RP/RC sin errores nuevos de TypeScript, ESLint o arquitectura.

- [ ] Corregir los errores TypeScript del provider de reportes, especialmente builders Supabase tipados como `Promise` y el `data` implícitamente `any`.
- [ ] Eliminar `any` introducidos o tocados por este cambio; la limpieza completa del archivo legado debe ir en otro plan si excede el alcance.
- [ ] Corregir las 4 violaciones arquitectónicas nuevas; no actualizar baseline.
- [ ] Ejecutar `npm exec tsc -- --noEmit --pretty false` y guardar el resultado antes/después.
- [ ] Ejecutar ESLint sobre los archivos tocados.
- [ ] Ejecutar `npm run check:architecture`.
- [ ] Commit: `fix(quality): restore type and architecture gates`.

### Task 7: Regresión, rendimiento y liberación

**Files:**
- Modify: `docs/modules/reporting/report-catalog.md`
- Create: `docs/changes/VALIDATION-historial-rp-rc.md`

**Interfaces:**
- Produces: evidencia auditable de liberación.

- [ ] Ejecutar la suite completa con un timeout adecuado y registrar total, aprobadas, fallidas y duración.
- [ ] Ejecutar una prueba con volumen representativo; comprobar que la consulta histórica está paginada y no hace N+1 por equipo.
- [ ] Comparar una muestra real de al menos 20 equipos: 5 por cada caso principal de la matriz.
- [ ] Verificar que Control de Calidad, detalle del reporte, resumen, CSV y XLSX coinciden.
- [ ] Ejecutar `npm run build`, `npm run check:architecture` y `npm test`; los tres deben finalizar con código 0.
- [ ] Separar archivos temporales, logs, `dist` y carpetas locales del commit.
- [ ] Crear commit final de evidencia: `docs(quality): record RP RC release validation`.

## Definition of Done

- La regla RP/RC existe una sola vez en un módulo de dominio puro.
- Control de Calidad y Motor de Reportes consumen la misma política.
- RP/RC no se determina con `current_status`.
- No existen dobles conteos RP+RC para la misma unidad aprobada.
- Pruebas unitarias, integración, exportación y muestra operativa pasan.
- TypeScript, ESLint de archivos tocados, arquitectura, build y suite completa terminan correctamente.
- El cambio se entrega en commits pequeños y revisables, sin artefactos temporales.

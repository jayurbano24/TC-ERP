# CHG: Bloqueo Reparación → Control de calidad

Fecha: 2026-10-27

## Síntomas (operador) → causa

| Qué ves en Taller → Reparación | Causa | Dónde |
|--------------------------------|--------|--------|
| Botones de resultado grises (“Control Calidad”, etc.) | `repairOutcomeBlocked`: no hay reparación elegida **o** el diagnóstico del equipo no tiene filas en `cat_diagnostic_repairs` | UI `OperationDrawer` |
| Toast: *No hay reparaciones configuradas para el diagnóstico…* | Mapeo vacío en Configuración → Catálogo Taller | Política `validateRepairsAgainstDiagnostics` |
| Toast: *El equipo no tiene diagnóstico inicial…* / *Seleccione al menos una reparación…* | Falta `current_diagnostics` o no eligió reparación | UI + API operate-batch |
| Toast: *El equipo no tiene Diagnóstico Inicial completado…* | Prerrequisito servidor (audit DIAG / legado) | `workshopStagePrerequisites` |

Tras guardar con resultado `control_calidad`, el status debe ser `in_validation` (cola QC).

## Fix código (esta CHG)

Typo en `loadWorkshopCompletionBySeries`: `WORKSHOP_STAGE_ACTIONS.DIG` → `DIAG`.

Sin el fix, equipos con `current_diagnostics` pero **sin** fila de auditoría `DIAGNÓSTICO INICIAL COMPLETADO` no marcaban DIAG en el Set. En cola Reparación el status suele ser `in_qc` (ya “past-diag”), así que el gate de prerrequisito a menudo **no** era el bloqueo visible; el bloqueo diario más frecuente es el **catálogo diagnóstico→reparación**.

El typo sí rompía el camino legado cuando el status sigue en `in_workshop` (sin tolerancia past-diag).

## Qué revisar en datos (sin código)

1. Abrir el equipo en Reparación y anotar el diagnóstico mostrado.
2. Configuración → Catálogo Taller: ese diagnóstico debe tener ≥1 reparación vinculada.
3. Elegir una reparación del listado filtrado → se habilitan los botones de resultado → **Control Calidad**.

## Tests

- `src/modules/workshop/server/workshopStagePrerequisites.test.ts`
- `src/modules/workshop/shared/workshopDiagnosticRepairPolicy.test.ts` (casos catálogo vacío / sin reparación)

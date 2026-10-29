# TC-ERP — Catálogo de Estados y Transiciones (borrador Fase B)

**Estado del documento:** BORRADOR — inventario factual. **Sin CHECK constraint aplicado.**  
**Commit:** `91a1bc8`  
**Fecha:** 2026-10-29  

---

## 1. Inventario de `series.current_status` (datos vivos, SELECT)

Fuente: consulta agregada no destructiva sobre `public.series`.

| Estado | Filas | Origen aparente |
| :--- | ---: | :--- |
| `in_central_warehouse` | 167799 | Bodega / post-QC “listo” |
| `dispatched` | 41866 | Despacho |
| `in_validation` | 13871 | QC / control calidad |
| `in_control_warehouse` | 7310 | L3 |
| `in_qc` | 5320 | Reparación L1/L2 |
| `RECEPCIONADO_BODEGA_GENERAL` | 5286 | **Legacy recepción** |
| `irreparable` | 4838 | Scraps |
| `in_workshop` | 3875 | Diagnóstico |
| `ready_to_dispatch` | 271 | Reacondicionado |
| `INGRESADO` | 46 | **Legacy recepción** |
| `in_dispatch_warehouse` | 40 | Despacho intermedio |
| `waiting_parts` | 15 | Solicitud de piezas |

**No observados en datos (sí en código/auditoría previa):** `returned`, `obsolete`, `archivado`, `scrapped` (alias UI de irreparable).

---

## 2. Mapa parcial código → destino (`resolveWorkshopNextStatus`)

| Resultado UI/API | `current_status` destino |
| :--- | :--- |
| `reacondicionado` | `ready_to_dispatch` |
| `reparacion` | `in_qc` |
| `control_calidad` | `in_validation` |
| `l3` | `in_control_warehouse` |
| `scraps` | `irreparable` |
| `listo` | `in_central_warehouse` |
| `rechazado_qc` | `in_qc` |
| (default) | `in_workshop` |

Fuente: `workshopOperateService.ts`.

---

## 3. Acciones y resultados permitidos (servidor TS)

| Acción | Resultados permitidos |
| :--- | :--- |
| DIAGNÓSTICO INICIAL COMPLETADO | reacondicionado, reparacion, l3 |
| REPARACIÓN COMPLETADA | control_calidad, reacondicionado, l3, scraps |
| REACONDICIONADO COMPLETADO | control_calidad, reparacion, l3, scraps |
| CONTROL DE CALIDAD COMPLETADO | listo, rechazado_qc |
| REPARACIÓN L3 COMPLETADA | reparacion, scraps |

**Regla adicional (catálogo):** diagnósticos con `allowed_outcomes = {reacondicionado}` solo; si se mezcla con falla de reparación, prevalecen L1/L2 + L3 (`workshopDiagnosticRepairPolicy`).

---

## 4. Pendiente (requiere aprobación Fase B)

Para cada transición operativa documentar: origen, destino, rol, prerrequisitos, evidencias, evento de auditoría, idempotencia.

**Bloqueo explícito:** no crear `CHECK (current_status IN (...))` hasta:

1. Decidir destino de `RECEPCIONADO_BODEGA_GENERAL` e `INGRESADO`.  
2. Incluir `waiting_parts`, `in_dispatch_warehouse`.  
3. Confirmar si `scrapped` debe normalizarse a `irreparable`.  
4. Validar dependencias en reportes, despacho y partes.

---

## 5. Fuente de verdad objetivo

1. **Catálogo de transiciones** (este documento + tabla/RPC).  
2. **RPC** `workshop_operate_batch_tx` como único mutador de etapa.  
3. **Frontend** solo refleja acciones permitidas; no es autoridad.

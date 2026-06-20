# returns — Casos de uso

**Versión:** 1.0

---

## UC-RN-01: RegisterIndividualReturn

### Actor
Operador logística / devoluciones

### Precondiciones
- SN existe en sistema (R-RN-02).

### Input
| Campo | Req |
|-------|-----|
| `sn` | Sí |
| `motivo` | Sí |
| `guiaSalida` | Sí |
| `originalGuide` | No |

### Flujo
1. Buscar serie por SN.
2. Validar guía si provista (R-RN-03).
3. Evaluar BlockReturnPolicy (R-RN-10).
4. Si block required → error + `requiresBlockReturn`.
5. Else → update status returned (R-RN-04).
6. Audit `DEVOLUCION_EQUIPO`.

### Postcondiciones
- Serie en `returned`.
- OS **sin cambio** (gap).

### Legacy
`registerNewReturn()` — `returns.ts`

---

## UC-RN-02: ProcessFullReceptionReturn

### Actor
Operador devoluciones (lote backoffice)

### Precondiciones
- Reception con series clasificadas (R-RN-21).

### Input
| Campo | Req |
|-------|-----|
| `receptionId` | Sí |
| `motivo`, `guiaSalida` | Sí |
| `observaciones` | No |
| `currentUserFullName` | Sí |

### Postcondiciones
- Todas series → returned + notes (R-RN-24).
- Reception → DEVUELTO + notes append.

### Riesgo
Batch sin TX (CHG-004).

### Legacy
`processFullReceptionReturn()` — `returns.ts`

---

## UC-RN-03: ProcessBlockReturnBySap

### Actor
Operador Backoffice historial / devoluciones

### Precondiciones
- `sapTransferId` válido (R-RN-30).
- Equipos en estado elegible (R-RN-12).
- Motivo y guía salida capturados.

### Input (`BlockReturnRequest`)

### Postcondiciones
- Series → returned (chunks 100).
- OS → DEVUELTO.
- SAP doc → DEVUELTO_BLOQUE.
- Audit `DEVOLUCION_BLOQUE_SAP`.

### Errores
| Mensaje típico |
|----------------|
| Documento SAP no encontrado |
| No hay equipos asociados |
| N equipos no están en estado Pendiente de Ingreso a Bodega General |
| Error de conexión (retry) |

### Legacy
`processBlockReturnBySapTransfer()` — `sapTransfers.ts` (re-export `returns.ts`)

---

## UC-RN-04: UndoFullReceptionReturn

### Actor
TI / ROOT (R-RN-44)

### Precondiciones
- Reception en DEVUELTO.
- Series en returned.

### Postcondiciones
- Series restauradas (R-RN-41, R-RN-42).
- Reception → PENDIENTE_BACKOFFICE (R-RN-43).

### Legacy
`undoFullReceptionReturn()` — `returns.ts`

---

## UC-RN-05: GetReturnedSeries

### Actor
UI bandeja devoluciones

### Output
Series con `current_status = 'returned'` + joins reception/OS.

### Legacy
`getReturns()` — `returns.ts`

---

## Flujo UI: Block return desde historial

1. Usuario confirma devolución bloque (Backoffice).
2. Prompts motivo + guía salida.
3. UC-RN-03.
4. Refresh historial.

**Ruta:** `/produccion/backoffice` → `handleSapBlockReturn`

---

## Pruebas paridad

- [ ] Individual 1 unidad SAP → OK
- [ ] Individual multi-unidad SAP → reject + offer block
- [ ] Block PRUEBAS-06 todas unidades
- [ ] Full reception return
- [ ] Undo → aparece en bandeja PENDIENTE_BACKOFFICE
- [ ] Audit logs creados

---

## Referencias

- Reglas: `business-rules.md`
- Tablas: `tables-and-relations.md`

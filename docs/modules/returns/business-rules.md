# returns — Reglas de negocio

**Versión:** 1.0 | IDs prefijo R-RN

---

## Devolución individual (UC-RN-01)

| ID | Regla | Validación | Error |
|----|-------|------------|-------|
| **R-RN-01** | SN obligatorio | `serialNumber.trim() !== ''` | SN obligatorio |
| **R-RN-02** | Serie debe existir | Row en `series` | Serie no encontrada |
| **R-RN-03** | Guía opcional debe coincidir | Si `originalGuide`, match `receptions.guide_number` | Guía no coincide |
| **R-RN-04** | Marcar returned | `current_status = 'returned'` | — |
| **R-RN-10** | Bloqueo SAP multi-unidad | Count series mismo `sap_transfer_id` en `RECEPCIONADO_BODEGA_GENERAL` > 1 | Devolución aislada no permitida |
| **R-RN-11** | Redirect bloque | Response incluye `requiresBlockReturn: true`, `sapTransferId` | UI ofrece bloque |

---

## Devolución lote completo (UC-RN-02)

| ID | Regla | Validación |
|----|-------|------------|
| **R-RN-20** | Recepción existe | `receptions.id` |
| **R-RN-21** | Al menos 1 serie | `series` count > 0 para reception |
| **R-RN-22** | Todas series → returned | Batch update |
| **R-RN-23** | Reception → DEVUELTO | Status + notes append |
| **R-RN-24** | Notes en series | Prefijo `--- DEVOLUCIÓN ---` en `series.notes` |

**Gap:** `Promise.all` sin TX — riesgo estado parcial (CHG-004).

---

## Devolución bloque SAP (UC-RN-03)

| ID | Regla | Validación |
|----|-------|------------|
| **R-RN-30** | SAP doc existe | `sap_transfer_documents.id` |
| **R-RN-31** | Hay equipos | series count > 0 por `sap_transfer_id` |
| **R-RN-12** | Estado elegible | Todas series en `RECEPCIONADO_BODEGA_GENERAL` |
| **R-RN-32** | Series → returned | Batch por chunks (100) |
| **R-RN-33** | OS → DEVUELTO | Distinct `service_order_id` |
| **R-RN-34** | SAP doc → DEVUELTO_BLOQUE | Update status |
| **R-RN-35** | Audit | `DEVOLUCION_BLOQUE_SAP` |

**Precondición UI:** prompts motivo + guía salida (Backoffice historial).

---

## Reversión devolución lote (UC-RN-04)

| ID | Regla | Validación |
|----|-------|------------|
| **R-RN-40** | Solo series returned | Filter `current_status = 'returned'` |
| **R-RN-41** | Restaurar status previo | Parse `PrevStatus:` en notes o fallback `CLASIFICADA` |
| **R-RN-42** | Limpiar block devolución | Regex remove `--- DEVOLUCIÓN ---` |
| **R-RN-43** | Reception → PENDIENTE_BACKOFFICE | Re-ingreso bandeja |
| **R-RN-44** | Rol TI/ROOT | UI `canReturnToPending` (legacy localStorage) |

---

## Reglas cruzadas con sap-transfer

| ID | Regla | Módulo dueño |
|----|-------|--------------|
| R-012 | SAP agrupa N equipos | sap-transfer |
| R-ST-15 | Pre-return status = RECEPCIONADO_BODEGA_GENERAL | sap-transfer classify |

---

## Matriz implementación actual

| ID | Archivo | Función |
|----|---------|---------|
| R-RN-01–11 | `returns.ts` | `registerNewReturn` |
| R-RN-20–24 | `returns.ts` | `processFullReceptionReturn` |
| R-RN-30–35 | `sapTransfers.ts` | `processBlockReturnBySapTransfer` |
| R-RN-40–43 | `returns.ts` | `undoFullReceptionReturn` |
| R-RN-44 | `backoffice/page.tsx` | role check |

---

## Referencias

- Estados: `state-machine.md`
- Casos de uso: `use-cases.md`

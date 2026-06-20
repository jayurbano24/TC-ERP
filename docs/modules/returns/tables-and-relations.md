# returns — Tablas y relaciones

**Versión:** 1.0

---

## 1. Tablas escritas por returns

### `series` (principal)

| Columna | Operación | Valores |
|---------|-----------|---------|
| `current_status` | UPDATE | → `returned` |
| `notes` | UPDATE | Prefijo `--- DEVOLUCIÓN ---` o bloque SAP |
| `updated_at` | UPDATE | now() |

**Columna requerida:** `notes` (migration 028).

### `service_orders`

| Columna | Operación | Cuándo |
|---------|-----------|--------|
| `status` | UPDATE → `DEVUELTO` | Solo UC-RN-03 bloque |

### `sap_transfer_documents`

| Columna | Operación | Cuándo |
|---------|-----------|--------|
| `status` | UPDATE → `DEVUELTO_BLOQUE` | UC-RN-03 |
| `updated_at` | UPDATE | UC-RN-03 |

### `receptions`

| Columna | Operación | Cuándo |
|---------|-----------|--------|
| `status` | UPDATE → `DEVUELTO` / `PENDIENTE_BACKOFFICE` | UC-RN-02 / UC-RN-04 |
| `notes` | UPDATE append / regex clean | UC-RN-02 / UC-RN-04 |

---

## 2. Tablas leídas

| Tabla | Uso |
|-------|-----|
| `series` | Lookup SN, count by sap_transfer_id |
| `receptions` | Validar guía, lote |
| `sap_transfer_documents` | Bloque SAP, display number |
| `reception_guides` | Bandeja devolución (`category = devolucion`) |

---

## 3. Auditoría

| Tabla | Acciones |
|-------|----------|
| `erp_audit_logs` | `DEVOLUCION_EQUIPO`, `DEVOLUCION_LOTE`, `DEVOLUCION_BLOQUE_SAP`, `REVERSO_*` |

Via `/api/audit` + service role.

---

## 4. Queries críticas

### Count unidades SAP activas (R-RN-10)
```
series WHERE sap_transfer_id = ? AND current_status = 'RECEPCIONADO_BODEGA_GENERAL'
```

### Series elegibles bloque (R-RN-12)
```
series WHERE sap_transfer_id = ? 
  AND current_status = 'RECEPCIONADO_BODEGA_GENERAL'
```

### Invalid count en bloque
Cualquier serie mismo SAP con status ≠ elegible → reject.

---

## 5. RPC planeado (CHG-004)

`block_return_by_sap_transfer_tx(p_sap_transfer_id, p_motivo, p_guia_salida, p_user)`

Atomic:
- UPDATE series (N)
- UPDATE service_orders (M)
- UPDATE sap_transfer_documents (1)
- INSERT audit (optional)

---

## 6. RLS

Returns usa mismas políticas que series / sap_transfer (025–027).  
Bloque return requiere UPDATE en 3 tablas — validar roles bodega/logística.

---

## Referencias

- SAP tables: `../sap-transfer/tables-and-relations.md`
- Integration: `../sap-transfer-returns/integration.md`

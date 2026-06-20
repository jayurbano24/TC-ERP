# sap-transfer — Casos de uso

**Versión:** 1.0 — Especificación sin implementación nueva

---

## UC-ST-01: RegisterSapDocument

### Actor
Operador Backoffice (CAC)

### Precondiciones
- Recepción CAC activa con `reception_guide_id` válido.
- Agencia CAC seleccionada en UI (≠ courier).
- Número SAP no vacío (R-ST-01).

### Input (`RegisterSapDocumentDto`)
| Campo | Tipo | Req |
|-------|------|-----|
| `receptionId` | UUID | Sí |
| `receptionGuideId` | UUID | Sí |
| `sapDocumentNumber` | string | Sí |
| `agency` | string | Sí |
| `registeredBy` | string | Sí |

### Flujo principal
1. Validar R-ST-01, R-ST-02, R-ST-03.
2. Invocar RPC `create_or_get_sap_transfer_document` (preferido) o fallback insert.
3. Si doc existente sin agency → completar agency (R-ST-05).
4. Retornar `SapTransferDocument`.

### Postcondiciones
- Existe fila en `sap_transfer_documents` con status `PENDIENTE_INGRESO_BODEGA`.
- UNIQUE `(reception_guide_id, sap_document_number)` respetado.

### Errores
| Código | Mensaje |
|--------|---------|
| `SAP_NUMBER_REQUIRED` | Documento SAP obligatorio |
| `AGENCY_REQUIRED` | Agencia CAC obligatoria |
| `AGENCY_IS_COURIER` | Valor es courier, no agencia |
| `NOT_AUTHENTICATED` | RPC sin auth |
| `RLS_DENIED` | Política Supabase |

### Impacto UI
- Panel manifiesto Backoffice; pestañas DOC. 1, DOC. 2…

### Legacy
`createOrGetSapTransfer()` — `sapTransfers.ts`

---

## UC-ST-02: ClassifyEquipmentBatch

### Actor
Operador Backoffice

### Precondiciones
- `sapTransferId` existe y pertenece a recepción activa.
- Manifiesto completo: tech, marca, modelo, cantidad, series pistoleadas.
- Documento SAP registrado (R-ST-20).

### Input (`ClassifyEquipmentBatchDto`)
| Campo | Tipo | Req |
|-------|------|-----|
| `receptionId` | UUID | Sí |
| `sapTransferId` | UUID | Sí |
| `units` | `EquipmentUnitDto[]` | Sí |
| `registeredBy` | string | Sí |

### Flujo principal (actual)
Por cada unidad:
1. Calcular `reentry_count` (R-ST-13).
2. Insert `service_orders` (R-ST-12, R-ST-16, R-ST-17).
3. Upsert `series` (R-ST-14, R-ST-15).
4. Si falla series → delete OS (rollback parcial).
5. Audit por serie.

### Flujo objetivo (Fase 1 — CHG-001)
1. Validar batch completo.
2. RPC `classify_equipment_batch_tx` — una transacción.
3. Emitir un audit batch.

### Postcondiciones
- N OS creadas con `sap_transfer_id`.
- Series en `RECEPCIONADO_BODEGA_GENERAL`.
- SAP doc permanece `PENDIENTE_INGRESO_BODEGA`.

### Errores
| Código | Mensaje |
|--------|---------|
| `EMPTY_BATCH` | No hay equipos |
| `OS_CREATE_FAILED` | Error creando OS |
| `SERIES_UPSERT_FAILED` | Error series; OS revertida |
| `DUPLICATE_OS_LABEL` | Violación unique label |

### Legacy
`classifyEquipmentBatch()` — `sapTransfers.ts`

---

## UC-ST-03: GetSapTransferBySeries

### Actor
Consulta, devoluciones, historial

### Precondiciones
- `seriesId` válido.

### Input
| Campo | Tipo |
|-------|------|
| `seriesId` | UUID |

### Output
`SapTransferDocument | null`

### Reglas
- R-ST-30: null si sin `sap_transfer_id`.

### Legacy
`getSapTransferBySeriesId()` — `sapTransfers.ts`

---

## Contratos entre módulos

| Consumidor | Caso de uso SAP |
|------------|-----------------|
| `production-classification` | UC-ST-01, UC-ST-02 |
| `returns` | UC-ST-03 (lookup) |
| `traceability` | UC-ST-03 |

---

## Pruebas de paridad (checklist)

- [ ] Crear SAP doc nuevo en guía vacía
- [ ] Re-llamar mismo SAP → idempotente
- [ ] Rechazar agency = courier name
- [ ] Clasificar 1 equipo 4 series
- [ ] Clasificar N equipos mismo SAP doc
- [ ] Fallo series → no OS huérfana (post CHG-001)
- [ ] Reentry count incrementa en reingreso

---

## Referencias

- Reglas: `business-rules.md`
- Tablas/RPC: `tables-and-relations.md`
- Migración: `migration-notes.md`

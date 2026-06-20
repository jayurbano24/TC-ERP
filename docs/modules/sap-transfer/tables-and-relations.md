# sap-transfer — Tablas y relaciones

**Versión:** 1.0 | Schema base: migration 024, 027

---

## 1. Tabla principal: `sap_transfer_documents`

| Columna | Tipo | Null | Default | Descripción |
|---------|------|------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PK |
| `reception_id` | UUID | NO | — | FK → receptions |
| `reception_guide_id` | UUID | NO | — | FK → reception_guides |
| `sap_document_number` | TEXT | NO | — | Número documento SAP |
| `agency` | TEXT | YES | — | Agencia CAC |
| `registered_by` | TEXT | YES | — | Usuario registro |
| `status` | TEXT | NO | `PENDIENTE_INGRESO_BODEGA` | Ver state-machine |
| `created_at` | TIMESTAMPTZ | NO | now() | |
| `updated_at` | TIMESTAMPTZ | NO | now() | |

### Constraints
- `uq_sap_transfer_per_guide (reception_guide_id, sap_document_number)` UNIQUE

### Índices
- `idx_sap_transfer_reception_id`
- `idx_sap_transfer_sap_number`
- `idx_sap_transfer_status`

---

## 2. Extensiones FK en tablas existentes

### `service_orders`
| Columna | FK |
|---------|-----|
| `sap_transfer_id` | → `sap_transfer_documents(id)` ON DELETE SET NULL |

Índice: `idx_service_orders_sap_transfer_id`

### `series`
| Columna | FK |
|---------|-----|
| `sap_transfer_id` | → `sap_transfer_documents(id)` ON DELETE SET NULL |
| `notes` | TEXT (migration 028) — trazabilidad devolución |

Índice: `idx_series_sap_transfer_id`

---

## 3. Tablas upstream (solo lectura del módulo)

### `receptions`
| Columna relevante | Uso |
|---------------------|-----|
| `id` | FK reception_id |
| `carrier` | Validar R-010 |
| `source` | Debe ser `cac` en flujo piloto |
| `processed_guides` | Array guías procesadas |

### `reception_guides`
| Columna relevante | Uso |
|---------------------|-----|
| `id` | FK reception_guide_id |
| `guide_number` | Display |
| `category`, `status` | Post-clasificación guía |
| `classified_by`, `classified_at` | Metadata |

Constraint: `uq_reception_guides_reception_guide (reception_id, guide_number)`

---

## 4. Diagrama relacional

```
receptions (1) ──────< reception_guides (N)
     │                        │
     │                        │ 1:N
     │                        ▼
     └──────────────< sap_transfer_documents (N)
                              │
                    ┌─────────┴─────────┐
                    │ 1:N             │ 1:N
                    ▼                 ▼
            service_orders          series
```

---

## 5. RPC PostgreSQL

### `create_or_get_sap_transfer_document`

| Parámetro | Tipo |
|-----------|------|
| `p_reception_id` | UUID |
| `p_reception_guide_id` | UUID |
| `p_sap_document_number` | TEXT |
| `p_agency` | TEXT (optional) |
| `p_registered_by` | TEXT (optional) |

**Retorno:** fila `sap_transfer_documents`  
**Seguridad:** `SECURITY DEFINER` — migration 027  
**Grant:** `authenticated`

### RPC planeado (CHG-001 — no implementado)

`classify_equipment_batch_tx(p_reception_id, p_sap_transfer_id, p_units jsonb, p_registered_by text)`

---

## 6. RLS (migration 025, 027)

| Política | Operación | Condición |
|----------|-----------|-----------|
| `sap_transfer_documents_select_auth` | SELECT | authenticated |
| `sap_transfer_documents_insert_auth` | INSERT | authenticated |
| `sap_transfer_documents_update_auth` | UPDATE | authenticated |
| `sap_transfer_documents_write_ops` | ALL | roles ops |

**Nota:** RPC bypass RLS para create idempotente.

---

## 7. Auditoría

| Tabla | Acciones |
|-------|----------|
| `erp_audit_logs` | Via `logAdvancedAudit` / `logAudit` |
| Acciones legacy | `RECEPCIÓN CAC` por serie en classify |

---

## 8. Scripts migración datos legacy

| Script | Propósito |
|--------|-----------|
| `migrate_sap_transfers.js` | Backfill SAP docs desde notes |
| `repair_sap_linkage.js` | Reparar vínculos OS/series ↔ SAP |
| `repair_orphan_cac.js` | Ingresos huérfanos sin OS |

**No ejecutar en prod sin CHG aprobado.**

---

## Referencias

- SQL: `supabase/migrations/024_sap_transfer_documents.sql`
- RLS/RPC: `supabase/migrations/027_sap_transfer_rls_fix.sql`
- Domain: `domain-model.md`

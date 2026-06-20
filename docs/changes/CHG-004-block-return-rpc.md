# CHG-004 — RPC atómica `block_return_by_sap_transfer_tx`

## Metadatos

| Campo | Valor |
|-------|-------|
| **ID cambio** | CHG-004 |
| **Título** | Transacción atómica para devolución en bloque por Documento SAP |
| **Módulo(s)** | `returns` + `sap-transfer` |
| **Fase ADR-001** | **1** |
| **Capas hexagonal** | `infrastructure` (RPC adapter); handler hexagonal en CHG-006 |
| **Autor** | Arquitectura TC-ERP |
| **Fecha** | 2026-06-18 |
| **Estado** | **Implementado** — aplicar migración 030 en Supabase; flag off por default |

---

## 1. Descripción

Hoy `processBlockReturnBySapTransfer()` en `sapTransfers.ts` actualiza series (por chunks), `service_orders` y `sap_transfer_documents` en **llamadas secuenciales**. Si falla el paso 3, los pasos 1–2 pueden quedar persistidos → inconsistencias (series devueltas pero SAP doc activo).

Este cambio introduce la RPC PostgreSQL `block_return_by_sap_transfer_tx` que ejecuta **toda la devolución bloque en una sola transacción** (R-RN-30–35, R-031). El wrapper legacy delega a la RPC cuando el feature flag `USE_ATOMIC_BLOCK_RETURN` está activo; si no, mantiene el flujo actual (Strangler).

**Por qué ahora:** Segundo entregable de Fase 1 del [plan maestro](../architecture/roadmap-phases.md), después de CHG-001. Cierra el riesgo transaccional en el flujo de devolución SAP más usado desde Historial Global y Devoluciones.

---

## 2. Reglas de negocio afectadas

| ID regla | Descripción | ¿Cambia comportamiento? |
|----------|-------------|-------------------------|
| R-RN-30 | SAP doc existe | No |
| R-RN-31 | Hay equipos asociados | No |
| R-RN-12 | Estados elegibles | No — `RECEPCIONADO_BODEGA_GENERAL` o `returned` (idempotencia parcial) |
| R-RN-32 | Series → returned | No |
| R-RN-33 | OS → DEVUELTO | No |
| R-RN-34 | SAP doc → DEVUELTO_BLOQUE | No |
| R-RN-35 | Audit | No — sigue en app layer post-RPC |
| **R-031** | Fallo = rollback completo | **Sí** — de chunks a TX única |

Referencia: `docs/modules/returns/business-rules.md`

---

## 3. Tablas y relaciones

| Tabla | Operación | Migración SQL |
|-------|-----------|---------------|
| `sap_transfer_documents` | SELECT + UPDATE status | Sí — `030_block_return_by_sap_transfer_tx.sql` |
| `series` | SELECT + UPDATE (N filas) | Sí — misma migración |
| `service_orders` | UPDATE (M filas) | Sí — misma migración |
| `erp_audit_logs` | INSERT | No — app layer (`logAdvancedAudit`) |

### Firma RPC

```sql
block_return_by_sap_transfer_tx(
  p_sap_transfer_id uuid,
  p_motivo text,
  p_guia_salida text,
  p_user text,
  p_observaciones text DEFAULT NULL
) RETURNS jsonb
-- { "units_count": N, "series_updated": M, "sap_document_number": "..." }
```

**Seguridad:** `SECURITY DEFINER`, `SET search_path = public`, validar `auth.uid() IS NOT NULL`.  
**Grant:** `authenticated`.

### Comportamiento TX

1. Validar `p_sap_transfer_id` existe.
2. Contar series con ese `sap_transfer_id` — si 0, error.
3. Rechazar si alguna serie tiene estado **no** en (`RECEPCIONADO_BODEGA_GENERAL`, `returned`).
4. Construir nota `--- DEVOLUCIÓN BLOQUE SAP ---` (mismo formato legacy).
5. UPDATE series elegibles (`RECEPCIONADO_BODEGA_GENERAL` → `returned` + notes).
6. UPDATE todas las OS distintas → `DEVUELTO`.
7. UPDATE `sap_transfer_documents` → `DEVUELTO_BLOQUE`.
8. Retornar conteos.

---

## 4. Rutas UI / APIs

| Ruta / endpoint | Cambio visible usuario |
|-----------------|------------------------|
| `/produccion/backoffice` (Historial → Devolver bloque) | **Ninguno** |
| `/logistica/devoluciones` | **Ninguno** |
| `processBlockReturnBySapTransfer()` | Interno: RPC vs loop según flag |

---

## 5. Compatibilidad hacia atrás

- [x] Datos legacy (`notes`) siguen legibles — misma plantilla nota en series
- [x] Estados legacy mapeados via alias — sin cambio
- [x] Scripts reparación siguen válidos
- [x] Rollback documentado — ver §7

**Breaking changes:** ninguno con flag `false`. Con flag `true`: si antes fallaba paso 3 y series ya estaban `returned`, ahora **rollback total** (comportamiento correcto).

---

## 6. Feature flag

| Flag | Default | Descripción |
|------|---------|-------------|
| `USE_ATOMIC_BLOCK_RETURN` | `false` | Si `true`, invoca RPC; si `false`, flujo legacy por chunks |

**Variable entorno:** `NEXT_PUBLIC_USE_ATOMIC_BLOCK_RETURN` o `NEXT_PUBLIC_FEATURE_FLAGS` (lista).

**Despliegue:** Paridad staging → activar tras CHG-001 estable en prod.

---

## 7. Plan de rollback

1. Setear `USE_ATOMIC_BLOCK_RETURN=false` en env.
2. Devolver 1 documento SAP de prueba en staging — confirmar estados.
3. (Solo emergencia) `DROP FUNCTION block_return_by_sap_transfer_tx` — preferir flag off.

**Tiempo estimado rollback:** 5 minutos.

---

## 8. Riesgo operativo

| Nivel | Criterio |
|-------|----------|
| ☐ Bajo | |
| ☑ **Medio** | Cambio atomicidad; paridad obligatoria |
| ☐ Alto | |

**Ventana despliegue:** fuera de pico para activar flag; migración SQL en horario laboral.

---

## 9. Pruebas de paridad requeridas

- [ ] Devolución bloque 2+ equipos mismo SAP desde Historial Global
- [ ] Devolución bloque desde `/logistica/devoluciones`
- [ ] Series ya `returned` + resto elegible → idempotencia OK
- [ ] Rechazo si alguna serie en `in_central_warehouse`
- [ ] **Fallo simulado** (SAP id inválido mid-flow no aplica — TX atómica)
- [ ] OS marcadas `DEVUELTO`, SAP doc `DEVUELTO_BLOQUE`
- [ ] Audit `DEVOLUCION_BLOQUE_SAP` registrado
- [ ] Comparar flag off vs on mismo documento (staging)

---

## 10. Documentación a actualizar

- [x] `modules/returns/migration-notes.md`
- [ ] `modules/returns/business-rules.md` — R-031 implementado
- [ ] `modules/sap-transfer/migration-notes.md` — referencia CHG-004

---

## 12. Cumplimiento hexagonal (ADR-004)

| Pregunta | Respuesta |
|----------|-----------|
| ¿Capa tocada? | `infrastructure` (RPC); handler en CHG-006 |
| ¿Nuevo port? | `IBlockReturnGateway` — CHG-006 |
| ¿Importa `lib/database` desde UI? | **Sí** — Strangler hasta CHG-006 |
| ¿Feature flag? | `USE_ATOMIC_BLOCK_RETURN` |

---

## 13. Entregables implementación

| # | Archivo / acción |
|---|------------------|
| 1 | `supabase/migrations/030_block_return_by_sap_transfer_tx.sql` |
| 2 | `processBlockReturnBySapTransfer` en `sapTransfers.ts` |
| 3 | Flag `USE_ATOMIC_BLOCK_RETURN` |
| 4 | Fix `BLOCK_RETURN_ELIGIBLE_STATUSES` exportado desde `sapTransfers.ts` |

---

## Referencias

- Plan: [roadmap-phases.md](../architecture/roadmap-phases.md) § Fase 1
- UC-RN-03: [use-cases.md](../modules/returns/use-cases.md)
- Integración: [integration.md](../modules/sap-transfer-returns/integration.md)
- Predecesor: [CHG-001](CHG-001-classify-atomic-rpc.md)

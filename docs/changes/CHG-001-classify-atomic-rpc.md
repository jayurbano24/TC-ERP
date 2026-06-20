# CHG-001 — RPC atómica `classify_equipment_batch_tx`

## Metadatos

| Campo | Valor |
|-------|-------|
| **ID cambio** | CHG-001 |
| **Título** | Transacción atómica para clasificación batch de equipos CAC |
| **Módulo(s)** | `sap-transfer` |
| **Fase ADR-001** | **1** |
| **Capas hexagonal** | `domain`, `application`, `infrastructure` (interfaces sin cambio visible Fase 1) |
| **Autor** | Arquitectura TC-ERP |
| **Fecha** | 2026-06-18 |
| **Estado** | **Implementado** — aplicar migración 029 en Supabase; flag off por default |

---

## 1. Descripción

Hoy `classifyEquipmentBatch()` en `sapTransfers.ts` procesa equipos en un **loop secuencial**: crea OS, upsert series, y si falla series solo revierte la OS de **esa** unidad. Si falla la unidad 3 de 5, las unidades 1–2 ya quedaron persistidas → inconsistencias y posibles OS huérfanas.

Este cambio introduce la RPC PostgreSQL `classify_equipment_batch_tx` que ejecuta **todo el batch en una sola transacción** (R-030, R-031). El wrapper legacy delega a la RPC cuando el feature flag `USE_ATOMIC_CLASSIFY` está activo; si no, mantiene el loop actual (Strangler).

**Por qué ahora:** Es el primer entregable de Fase 1 del [plan maestro](../architecture/roadmap-phases.md), prerequisito para confiabilidad operativa CAC antes de modularizar UI.

---

## 2. Reglas de negocio afectadas

| ID regla | Descripción | ¿Cambia comportamiento? |
|----------|-------------|-------------------------|
| R-ST-10 | Al menos 1 equipo en batch | No |
| R-ST-11 | `main_serial` obligatorio | No — skip unidades vacías |
| R-ST-12 | OS única por equipo (label TC-XXX) | No |
| R-ST-13 | `reentry_count` = count(OS mismo serial) + 1 | No — misma lógica dentro TX |
| R-ST-14 | Upsert series `onConflict serial_number` | No |
| R-ST-15 | Serie → `RECEPCIONADO_BODEGA_GENERAL` | No |
| R-ST-16 | OS → `INGRESADO` | No |
| R-ST-17 | OS y series con `sap_transfer_id` | No |
| **R-030** | Clasificar = 1 transacción | **Sí** — de loop a RPC TX |
| **R-031** | Fallo = rollback completo del batch | **Sí** — ninguna OS parcial |

Referencia: `docs/modules/sap-transfer/business-rules.md`

---

## 3. Tablas y relaciones

| Tabla | Operación | Migración SQL |
|-------|-----------|---------------|
| `service_orders` | INSERT (N filas) | Sí — `029_classify_equipment_batch_tx.sql` |
| `series` | UPSERT (N filas) | Sí — misma migración |
| `sap_transfer_documents` | SELECT (validar `p_sap_transfer_id`) | No write |
| `receptions` | SELECT (validar `p_reception_id`) | No write |
| `erp_audit_logs` | INSERT (1 registro batch post-commit) | Opcional en RPC o app layer |

### Esquema JSON `p_units` (jsonb array)

```json
[
  {
    "main_serial": "string",
    "model_id": "uuid",
    "brand_id": "uuid",
    "all_series": ["S1", "S2", "S3", "S4"],
    "material": "string optional"
  }
]
```

### Firma RPC

```sql
classify_equipment_batch_tx(
  p_reception_id uuid,
  p_sap_transfer_id uuid,
  p_units jsonb,
  p_registered_by text DEFAULT NULL
) RETURNS jsonb  -- { "service_orders": [...], "series_count": N }
```

**Seguridad:** `SECURITY DEFINER`, `SET search_path = public`, validar `auth.uid() IS NOT NULL`.  
**Grant:** `authenticated` (igual que `create_or_get_sap_transfer_document`).

### Comportamiento TX

1. Validar `p_sap_transfer_id` existe y pertenece a `p_reception_id`.
2. Validar `jsonb_array_length(p_units) > 0` tras filtrar unidades sin `main_serial`.
3. Por cada unidad (dentro de la misma TX):
   - Calcular `reentry_count`.
   - INSERT `service_orders` (trigger genera `os_label` si aplica).
   - UPSERT `series` para `all_series`.
4. Si cualquier paso falla → `RAISE` → rollback automático PostgreSQL.
5. Retornar IDs de OS creadas.

---

## 4. Rutas UI / APIs

| Ruta / endpoint | Cambio visible usuario |
|-----------------|------------------------|
| `/produccion/backoffice` | **Ninguno** — misma UI manifiesto y botón clasificar |
| `classifyEquipmentBatch()` | Interno: RPC vs loop según flag |

El backoffice sigue llamando `classifyEquipmentBatch` desde `page.tsx` L~1517. No se mueve a hexagonal UI en este CHG.

---

## 5. Compatibilidad hacia atrás

- [x] Datos legacy (`notes`) siguen legibles — classify no escribe notes
- [x] Estados legacy mapeados via alias — sin cambio de estados
- [x] Scripts reparación (`repair_orphan_cac.js`, etc.) siguen válidos
- [x] Rollback documentado — ver §7

**Breaking changes:** ninguno con flag `false`. Con flag `true`: si antes fallaba unidad 3 y quedaban 1–2 creadas, ahora **ninguna** se crea (comportamiento correcto).

---

## 6. Feature flag

| Flag | Default | Descripción |
|------|---------|-------------|
| `USE_ATOMIC_CLASSIFY` | `false` | Si `true`, `classifyEquipmentBatch` invoca RPC; si `false`, loop legacy |

**Variable entorno sugerida:** `NEXT_PUBLIC_USE_ATOMIC_CLASSIFY` o lectura desde `FeatureFlagService` / tabla config.

**Despliegue:** 1 semana staging con flag `true` → producción fuera de pico → default `true` tras paridad.

---

## 7. Plan de rollback

1. Setear `USE_ATOMIC_CLASSIFY=false` en env o config (sin redeploy de migración).
2. Verificar que `classifyEquipmentBatch` usa loop legacy en logs.
3. Clasificar 1 equipo de prueba en staging/prod — confirmar OS + series creadas.
4. (Solo si RPC corrupta) `DROP FUNCTION classify_equipment_batch_tx` — **no recomendado**; preferir flag off.

**Tiempo estimado rollback:** 5 minutos (cambio flag + verificación).

La migración SQL **no se revierte** en rollback operativo — la función queda inactiva.

---

## 8. Riesgo operativo

| Nivel | Criterio |
|-------|----------|
| ☐ Bajo | Solo refactor interno; misma UI |
| ☑ **Medio** | Cambio en atomicidad; paridad testeada obligatoria |
| ☐ Alto | Migración datos; ventana mantenimiento |

**Ventana despliegue recomendada:** **fuera de horario pico** para activar flag; migración SQL en horario laboral (no bloquea operación).

---

## 9. Pruebas de paridad requeridas

Marcar antes de activar flag en producción:

- [ ] Clasificar 1 equipo con 4 series (S1–S4) — OS TC-XXX + series `RECEPCIONADO_BODEGA_GENERAL`
- [ ] Clasificar 3 equipos mismo documento SAP en un batch
- [ ] Reingreso: mismo `main_serial` → `reentry_count` incrementa
- [ ] **Fallo simulado:** serial duplicado inválido en unidad 2 → **0** OS nuevas (rollback total)
- [ ] `sap_transfer_id` en OS y todas las series
- [ ] Caso feliz CAC completo (recepción → clasificación → historial visible)
- [ ] Regresión RLS / permisos rol backoffice
- [ ] Comparar resultado flag off vs on en mismo manifiesto (staging)

*No aplica en este CHG:* devoluciones, PX, ingreso bodega (CHG-004+).

---

## 10. Documentación a actualizar

- [ ] `modules/sap-transfer/migration-notes.md` — marcar CHG-001 aprobado
- [ ] `modules/sap-transfer/tables-and-relations.md` — documentar RPC implementada
- [ ] `modules/sap-transfer/business-rules.md` — R-030/R-031 estado = implementado
- [ ] Glosario — no aplica

---

## 12. Cumplimiento hexagonal (ADR-004)

| Pregunta | Respuesta |
|----------|-----------|
| ¿Capa tocada? | `infrastructure` (RPC adapter) + inicio `application` (handler opcional Fase 1 mínima) |
| ¿Nuevo port? | `IClassifyBatchGateway` en `domain/ports/classify-batch.gateway.port.ts` |
| ¿Nuevo adaptador? | `ClassifyBatchRpcAdapter` implementa port; `ClassifyBatchLegacyGateway` delega loop actual |
| ¿Importa `lib/database` desde UI? | **Sí** — backoffice sigue importando `classifyEquipmentBatch` (Strangler; CHG-003 retira) |
| ¿Comunicación cross-módulo? | N/A |
| ¿Registro DI (`container.ts`)? | Opcional Fase 1 — wrapper en `sapTransfers.ts` suficiente; DI completo en CHG-003 |
| ¿Feature flag Strangler? | `USE_ATOMIC_CLASSIFY` |

**Alcance mínimo Fase 1 (este CHG):**

```
sapTransfers.ts classifyEquipmentBatch
  → if USE_ATOMIC_CLASSIFY → supabase.rpc('classify_equipment_batch_tx')
  → else → loop legacy (actual)
```

**Alcance CHG-003 (Fase 2):** mover a `ClassifyEquipmentBatchHandler` + DI.

---

## 13. Entregables implementación (checklist dev)

| # | Archivo / acción |
|---|------------------|
| 1 | `supabase/migrations/029_classify_equipment_batch_tx.sql` |
| 2 | Actualizar `classifyEquipmentBatch` en `src/lib/database/sapTransfers.ts` |
| 3 | Flag `USE_ATOMIC_CLASSIFY` en env o `FeatureFlagService` |
| 4 | Audit batch post-RPC (1 llamada vs N en loop) |
| 5 | (Opcional) `src/modules/sap-transfer/domain/ports/classify-batch.gateway.port.ts` |
| 6 | (Opcional) `src/modules/sap-transfer/infrastructure/rpc/classify-batch.rpc.adapter.ts` |

---

## 14. Aprobaciones

| Rol | Aprobado | Fecha |
|-----|----------|-------|
| Product Owner / Negocio | Sí (plan maestro) | 2026-06-18 |
| Tech Lead | Pendiente firma | |
| Operaciones CAC | Pendiente paridad staging | |

---

## Referencias

- Plan: [roadmap-phases.md](../architecture/roadmap-phases.md) § Fase 1
- UC-ST-02: [use-cases.md](../modules/sap-transfer/use-cases.md)
- Legacy: `src/lib/database/sapTransfers.ts` L115–201
- RPC patrón: `027_sap_transfer_rls_fix.sql`

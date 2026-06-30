# CHG-002 — Sync `sap_transfer_documents` → `INGRESADO_BODEGA`

## Metadatos

| Campo | Valor |
|-------|-------|
| **ID cambio** | CHG-002 |
| **Título** | Sincronizar estado del Documento SAP a `INGRESADO_BODEGA` al encajonar en bodega central |
| **Módulo(s)** | `warehouse` (co-dueño) + `sap-transfer` |
| **Fase ADR-001** | **2A** |
| **Capas hexagonal** | `infrastructure` (RPC PostgreSQL); seam app en `lib/database/warehouse.ts` |
| **Autor** | Arquitectura TC-ERP |
| **Fecha** | 2026-06-29 |
| **Estado** | **Implementado** — migración `055` + wiring en `warehouse.ts`; aplicar `055` en Supabase |

---

## 1. Descripción

Antes de este cambio, `sap_transfer_documents.status` se creaba en `PENDIENTE_INGRESO_BODEGA` y **nunca** transicionaba a `INGRESADO_BODEGA`, aunque todas las series del documento ya estuvieran físicamente encajonadas en bodega central. Resultado: el Historial Global mostraba "Pendiente" para documentos ya ingresados (ver [state-machine.md](../modules/sap-transfer/state-machine.md) §6).

CHG-002 cierra ese gap: cuando **todas** las series de un Documento SAP alcanzan `current_status = 'in_central_warehouse'` (con caja asignada), el documento pasa a `INGRESADO_BODEGA` de forma idempotente. La transición se dispara desde los flujos de ingreso a bodega, vía la RPC `warehouse_sync_sap_for_series`.

**Por qué ahora:** Entregable C2A-01 del Track CAC maduro ([roadmap-phases.md](../architecture/roadmap-phases.md) § Fase 2A), complementario al cierre de CHG-003/006/007.

---

## 2. Reglas de negocio afectadas

| ID regla | Descripción | ¿Cambia comportamiento? |
|----------|-------------|-------------------------|
| R-ST-INGRESO | Doc SAP → `INGRESADO_BODEGA` cuando 100% de sus series en bodega central | **Sí** — antes nunca se seteaba |
| Idempotencia | Re-ejecutar no re-actualiza si ya está `INGRESADO_BODEGA` | Nuevo — `coalesce(status,'') <> 'INGRESADO_BODEGA'` |

**Criterio de "todas las series":** la RPC cuenta **todas** las series con ese `sap_transfer_id`. Si alguna serie fue devuelta/scrapeada/despachada antes de completar el ingreso, el documento no alcanza `INGRESADO_BODEGA` hasta que el resto esté en bodega. Es el comportamiento literal documentado ("Todas las series → IN_CENTRAL_WAREHOUSE"); cualquier ajuste a "todas las series **activas**" sería un CHG futuro.

---

## 3. Tablas y relaciones

| Tabla | Operación | Migración SQL |
|-------|-----------|---------------|
| `series` | SELECT (conteo por estado) | `055_warehouse_sap_sync_chg002.sql` |
| `sap_transfer_documents` | UPDATE status + updated_at | misma migración |

### Firmas RPC

```sql
warehouse_sync_sap_transfer_ingresado(p_sap_transfer_id uuid) RETURNS boolean
-- true si transicionó a INGRESADO_BODEGA en esta llamada

warehouse_sync_sap_for_series(p_series_ids uuid[]) RETURNS integer
-- nº de documentos SAP distintos que pasaron a INGRESADO_BODEGA

warehouse_ingreso_tx(p_series text[], p_location text, p_operator_id uuid,
  p_operator_name text, ...) RETURNS jsonb
-- ingreso manual atómico; llama warehouse_sync_sap_for_series al final
```

**Seguridad:** `SECURITY DEFINER`, `SET search_path = public`.
**Grant:** `authenticated`, `service_role`.

### Comportamiento

1. Resolver los `sap_transfer_id` distintos de las series ingresadas.
2. Por cada documento: contar `total` de series y `in_bodega` (`in_central_warehouse` + `current_box_id` no nulo).
3. Si `in_bodega = total` (y `total > 0`), UPDATE → `INGRESADO_BODEGA` (idempotente).
4. Retornar conteo de documentos sincronizados.

---

## 4. Rutas UI / APIs

| Ruta / función | Cambio visible usuario |
|----------------|------------------------|
| `/bodega/gestion`, `/bodega/ingreso` (encajonar) | Documento SAP refleja `INGRESADO_BODEGA` en Historial |
| `createBodegaBoxAtomic()` / `addSeriesToBox()` | Interno: llaman `syncSapTransferIngresadoForSeries` tras vincular series |
| `warehouse_ingreso_tx` (ingreso manual) | Sync incluido en la TX |

---

## 5. Compatibilidad hacia atrás

- [x] Migración idempotente — segura de re-ejecutar (compatible con `047_warehouse_phase3.sql`).
- [x] Si la RPC no existe en el entorno, el seam app captura el error y hace `console.warn` (no rompe el ingreso).
- [x] Documentos ya `INGRESADO_BODEGA` no se re-actualizan.
- [x] No hay backfill destructivo; los documentos históricos se corrigen al re-ingresar o vía script puntual.

**Breaking changes:** ninguno.

---

## 6. Feature flag

Sin flag. El cambio es aditivo y de bajo riesgo: solo **avanza** el estado del documento cuando se cumple la condición completa; nunca lo retrocede.

---

## 7. Plan de rollback

1. (Solo emergencia) `DROP FUNCTION public.warehouse_sync_sap_for_series(uuid[]);` y `warehouse_sync_sap_transfer_ingresado(uuid)`.
2. El seam app degrada a no-op (`console.warn`) sin afectar el ingreso.

**Tiempo estimado rollback:** 5 minutos.

---

## 8. Riesgo operativo

| Nivel | Criterio |
|-------|----------|
| ☑ **Bajo** | Transición aditiva e idempotente; no muta series ni OS |
| ☐ Medio | |
| ☐ Alto | |

**Ventana despliegue:** migración SQL en horario laboral; sin ventana especial.

---

## 9. Pruebas de paridad requeridas

- [ ] Encajonar la **última** serie de un Documento SAP → documento pasa a `INGRESADO_BODEGA`.
- [ ] Encajonar serie parcial (faltan otras) → documento permanece `PENDIENTE_INGRESO_BODEGA`.
- [ ] Re-ejecutar sobre documento ya ingresado → sin cambios (idempotente).
- [ ] Documento sin series → no transiciona.
- [ ] Ingreso manual vía `warehouse_ingreso_tx` → sync disparado.

---

## 12. Cumplimiento hexagonal (ADR-004)

| Pregunta | Respuesta |
|----------|-----------|
| ¿Capa tocada? | `infrastructure` (RPC) + seam en `lib/database/warehouse.ts` |
| ¿Nuevo port? | No — sync intra-base vía RPC; consumido por warehouse |
| ¿Comunicación cross-módulo? | warehouse escribe estado de sap-transfer (co-propiedad documentada) |
| ¿Feature flag? | No — aditivo idempotente |

**Evento futuro:** `SapTransferWarehouseReceivedEvent` (cuando se cablee el outbox de dominio).

---

## 13. Entregables implementación

| # | Archivo / acción | Estado |
|---|------------------|--------|
| 1 | `supabase/migrations/055_warehouse_sap_sync_chg002.sql` | ✓ |
| 2 | `syncSapTransferIngresadoForSeries()` en `lib/database/warehouse.ts` | ✓ |
| 3 | Wiring en `createBodegaBoxAtomic()` + `addSeriesToBox()` | ✓ |
| 4 | Sync en `warehouse_ingreso_tx` (ingreso manual) | ✓ |

---

## Referencias

- Plan: [roadmap-phases.md](../architecture/roadmap-phases.md) § Fase 2A (C2A-01)
- Estados: [state-machine.md](../modules/sap-transfer/state-machine.md)
- Migración base warehouse: `047_warehouse_phase3.sql`

# platform-events — Catálogo v1 (Fase A)

Motor de eventos de dominio **observe-only**: la operación principal no depende del worker.

## Tablas

| Tabla | Rol |
|-------|-----|
| `domain_events` | Registro inmutable de hechos de negocio |
| `outbox_event` | Cola local para worker async (retry / DLQ) |

Migración: `supabase/migrations/050_platform_events_phase_a.sql`

## RPC

| Función | Uso |
|---------|-----|
| `emit_domain_event(...)` | INSERT evento + outbox en **una transacción** |
| `get_entity_timeline(type, id)` | Timeline por agregado |
| `get_correlation_timeline(id)` | Timeline por correlation ID |
| `audit_domain_events_stats(days)` | KPI / baseline |

Cliente TS: `src/lib/database/domainEvents.ts`

## Catálogo eventos v1

### CAC / Backoffice (`source: cac_backoffice`)

| event_type | aggregate_type | Cuándo |
|------------|----------------|--------|
| `cac.equipment.classified` | `service_order` | Clasificación unidad |
| `cac.classify.batch_completed` | `reception` | Fin batch classify |
| `cac.sap_transfer.block_returned` | `sap_transfer_document` | Devolución bloque SAP |
| `cac.reception.classified` | `reception` | Recepción clasificada |

### PX (`source: px_reception`)

| event_type | aggregate_type | Cuándo |
|------------|----------------|--------|
| `px.reception.started` | `reception` | Inicio recepción PX |
| `px.equipment.captured` | `px_equipment` | Scan equipo |
| `px.reception.completed` | `reception` | Cierre recepción |

### Módulos hexagonales (futuro)

| event_type | Emisor |
|------------|--------|
| `RecepcionCreatedEvent` | `OrdenServicioAggregate` (in-process) |
| `DespachoCreadoDomainEvent` | `DespachoAggregate` |

## Patrón obligatorio (Fase A–D)

```
1. Transacción de negocio (COMMIT)
2. emit_domain_event en misma TX
3. Respuesta al usuario
4. Worker procesa outbox (observe / KPI / audit)
```

**Prohibido en Fase A:** cadena síncrona donde falla el evento → falla la operación.

## Worker

`src/workers/OutboxPublisherWorker.ts` — batch `outbox_event` → `EventBus` local.

Producción: cron Vercel `GET/POST /api/internal/outbox-publish` (`vercel.json`, cada minuto, `CRON_SECRET`).  
Handlers de dominio aún opcionales: sin handler el evento se marca `COMPLETED` (observe-only).

## Validación

```bash
# SQL
scripts/metrics_baseline_phase_a.sql

# API
GET /api/metrics/baseline
GET /api/health
```

## Referencias

- [migration-playbook.md](../../architecture/migration-playbook.md) — Fase A / D
- [roadmap-phases.md](../../architecture/roadmap-phases.md) — Fase 2 eventos

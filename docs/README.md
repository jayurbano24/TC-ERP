# TC-ERP — Documentación de arquitectura

Índice central de documentación técnica.  
**Regla:** No implementar código sin consultar ADR + módulo + plantilla de impacto.

---

## Arquitectura global

| Documento | Descripción |
|-----------|-------------|
| [ADR-001](architecture/ADR-001-monolith-modular-evolution.md) | Decisión monolito modular + fases |
| [Ecosystem Map](architecture/ecosystem-map.md) | **Todos los módulos**: SAP archivo, KPI, RRHH, Finanzas, PO, Lote |
| [ADR-002 PO/Lote/Finanzas](architecture/ADR-002-production-order-and-lote.md) | **Aprobado** — PO Taller, despacho caja+lote, finanzas por equipo |
| [ADR-003 API Centro Documentos](architecture/ADR-003-api-document-center.md) | API REST + webhooks |
| [ADR-004 Hexagonal](architecture/ADR-004-hexagonal-architecture.md) | **Obligatorio** — Ports & Adapters, escalabilidad |
| [Layout hexagonal](architecture/hexagonal-layout.md) | Carpetas, ports, legacy bridge, checklist PR |
| [**Plan maestro por fases**](architecture/roadmap-phases.md) | **Entregables, CHGs, cronograma, criterios salida** |
| [**Guía de migración (playbook)**](architecture/migration-playbook.md) | **Cómo migrar sin detener operación — reglas, fases A–D, checklist** |
| [platform-events](modules/platform-events/README.md) | **Fase A** — domain_events, outbox, catálogo v1 |
| [Glosario](architecture/glossary.md) | Nomenclatura obligatoria |
| [Catálogo de estados](architecture/entity-status-catalog.md) | Estados canónicos + alias legacy |
| [Plantilla impacto](architecture/impact-change-template.md) | Obligatoria antes de cada CHG |

---

## Módulos piloto (Fase 1–2)

### sap-transfer

| Documento | Líneas aprox. |
|-----------|---------------|
| [README](modules/sap-transfer/README.md) | Overview |
| [domain-model](modules/sap-transfer/domain-model.md) | Entidades |
| [business-rules](modules/sap-transfer/business-rules.md) | R-ST-* |
| [state-machine](modules/sap-transfer/state-machine.md) | Estados SAP |
| [use-cases](modules/sap-transfer/use-cases.md) | UC-ST-01–03 |
| [tables-and-relations](modules/sap-transfer/tables-and-relations.md) | Schema |
| [migration-notes](modules/sap-transfer/migration-notes.md) | CHG-001–003 |

### returns

| Documento | Líneas aprox. |
|-----------|---------------|
| [README](modules/returns/README.md) | Overview |
| [domain-model](modules/returns/domain-model.md) | Políticas |
| [business-rules](modules/returns/business-rules.md) | R-RN-* |
| [state-machine](modules/returns/state-machine.md) | Transiciones |
| [use-cases](modules/returns/use-cases.md) | UC-RN-01–05 |
| [tables-and-relations](modules/returns/tables-and-relations.md) | Tablas |
| [migration-notes](modules/returns/migration-notes.md) | CHG-004–007 |

### Integración piloto

| Documento | Descripción |
|-----------|-------------|
| [sap-transfer ↔ returns](modules/sap-transfer-returns/integration.md) | Contratos, flujos, CHGs coordinados |

---

## Módulos diseño aprobado (2026-06-18) — pendiente implementación

| Módulo | Doc | Decisión negocio |
|--------|-----|------------------|
| PO (solo Taller + bodega) | [production-order](modules/production-order/README.md) | ADR-002 D1 |
| Despacho por Caja + Lote Salida | [outbound-dispatch](modules/outbound-dispatch/README.md) | ADR-002 D2 |
| Finanzas por equipo despachado | [finance-costing](modules/finance-costing/README.md) | ADR-002 D3 |
| Accesorios nuevo/recuperado con/sin lote | [accessories-dispatch](modules/accessories-dispatch/README.md) | ADR-002 D4 |
| **Reportes centralizados** | [reporting](modules/reporting/README.md) + [catálogo](modules/reporting/report-catalog.md) | P0 enterprise |

---

## CHGs planeados (sin implementar)

| ID | Título | Módulo | Fase |
|----|--------|--------|------|
| CHG-001 | RPC classify_equipment_batch_tx | sap-transfer | 1 | [doc](changes/CHG-001-classify-atomic-rpc.md) ✓ |
| CHG-002 | Sync INGRESADO_BODEGA | sap-transfer + warehouse | 2 | [doc](changes/CHG-002-warehouse-sap-sync.md) ✓ migración 055 + wiring |
| CHG-003 | Extraer módulo sap-transfer | sap-transfer | 2 | ✓ 100% hexagonal/RPC, legacy retirado |
| CHG-004 | RPC block_return_by_sap_transfer_tx | returns + sap-transfer | 1 | [doc](changes/CHG-004-block-return-rpc.md) ✓ |
| CHG-005 | RPC full_reception_return_tx | returns | 1 | [doc](changes/CHG-005-full-reception-return-rpc.md) ✓ |
| CHG-006 | Desacoplar SapTransferReturnPort | returns + sap-transfer | 2 | ✓ port inyectado en `returns/factory` |
| CHG-007 | OS update en devolución individual | returns | 2 | ✓ `registerIndividualReturnHex` (default vivo) |
| CHG-010 | Tabla `dispatch_batches` + FKs | outbound-dispatch | 2 | ✓ migración 048 + RPC adapter |
| CHG-011 | UI lote salida en `/despacho` | outbound-dispatch | 2 | ✓ pestaña "Lotes de salida" (`DispatchBatchPanel`, gated `USE_HEXAGONAL_OUTBOUND_DISPATCH`) |
| CHG-020 | `cost_ledger_entries` + materiales | finance-costing | 3 |
| CHG-021 | Pago por equipo despachado (evento) | finance-costing | 3 |
| CHG-030 | Accesorios OUT con/sin lote | accessories-dispatch | 2 |
| CHG-040 | Tabla `production_orders` + FK OS | production-order | 2 |
| CHG-041 | API PO → Centro Documentos | production-order + ADR-003 | 3 |
| CHG-050 | Tablas report_definitions + report_runs | reporting | 2 |
| CHG-051 | Módulo reporting hexagonal + exporters | reporting | 2 |
| CHG-052 | Migrar reporte CAC histórico (backoffice) | reporting | 2 |
| CHG-053 | Portal `/reportes` | reporting | 2 |

**Próximo paso:** Track CAC maduro completo (CHG-002/003/006/007/010/011 ✓). Pendiente: activar flag `USE_HEXAGONAL_OUTBOUND_DISPATCH` y vincular equipos/cajas a un lote (asignación de ítems al `dispatch_batch`).

---

## Módulos futuros (documentación pendiente)

| Módulo | Incluye | Prioridad doc |
|--------|---------|---------------|
| **sap-integration** | Gate despacho (port validación) ✓ — [doc](modules/sap-integration/README.md) · pendiente: carga CSV SAP, matching, diferencias | **P0** |
| **reporting** | Reportes Excel/PDF/CSV centralizados — [doc](modules/reporting/README.md) | **P0** ✓ |
| **kpi-analytics** | Productividad diaria por persona, metas taller | **P0** |
| **production-order (PO)** | Solicitud producción Taller — [doc](modules/production-order/README.md) | **P1** ✓ |
| **outbound-dispatch** | Salidas caja + Lote — [doc](modules/outbound-dispatch/README.md) | P1 ✓ |
| **finance-costing** | Costo vs despacho, HH/PO — [doc](modules/finance-costing/README.md) | P1 ✓ |
| **accessories-dispatch** | Accesorios con/sin lote — [doc](modules/accessories-dispatch/README.md) | P1 ✓ |
| `logistics-reception` | Recepción CAC/PX | P2 |
| `production-classification` | Backoffice completo | P2 |
| `warehouse` | Bodega | P2 |
| `workshop` | Taller | P2 |
| **rrhh-hrms** | Personal, planilla, ZKTeco | P2 |
| **gestion-costos** | → migrar a `finance-costing` | P2 |
| **gestion-bi** | BI gerencial — consume reporting + KPI | P3 |
| `traceability` | Consulta | P3 |
| `accessories` | Stock accesorios (base) — despacho en `accessories-dispatch` | P3 |
| `platform` | Auth, audit, config | P3 |

---

## Gobierno de código (recordatorio)

1. Archivos ≤ 300 líneas.
2. Una responsabilidad por función/caso de uso.
3. Reglas solo en `domain/` (hexagonal).
4. Rutas URL sin cambiar en Fase 1–2.
5. Impacto documentado antes de merge.
6. **Sin** `domain/` → `infrastructure/` imports (ADR-004).
7. Código nuevo (PO, lote, finanzas) = hexagonal desde día 1.

---

**Última actualización:** 2026-06-18

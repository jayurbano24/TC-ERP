# Fase 1 Enterprise: Tareas de Ejecución (12 Hitos)

- [x] **Hito 1: Estructura del proyecto**
  - [x] Crear directorios `src/modules/`, `src/shared/`, `src/infrastructure/`, `src/workers/`, `tests/`, `docs/adr/`.
  - [x] Crear primeros ADRs (Monolito Modular, Prisma).
- [x] **Hito 2: Prisma ORM**
  - [x] Instalar dependencias `prisma` y `@prisma/client`.
  - [x] Inicializar Prisma (`npx prisma init`).
  - [x] Diseñar `schema.prisma` base (Tenant, Branch, Soft Delete, Audit, Events).
- [x] **Hito 3: BaseEntity + BaseAggregate + Value Objects**
  - [x] Crear `BaseEntity` y `BaseAggregate`.
  - [x] Implementar genéricos de `Value Objects` (`Email`, `Phone`).
  - [x] Implementar `IIdGenerator` e `IClock`.
- [x] **Hito 4: Repository Pattern**
  - [x] Interfaz `IRepository<T>`.
  - [x] Implementar `BasePrismaRepository<T>` con multitenancy.
  - [x] Estructurar capa de Mappers (`EntityMapper`).
- [x] **Hito 5: Dependency Injection**
  - [x] Instalar contenedor (`tsyringe`).
  - [x] Auto-registro de dependencias.
- [x] **Hito 6: Event Bus + Event Handlers**
  - [x] Contratos `IEventBus`, `IEventHandler`.
  - [x] Implementación `LocalEventBus`.
- [x] **Hito 7: Outbox Pattern + Worker + Retry**
  - [x] Tabla `outbox_events` y hook transaccional Prisma.
  - [x] `OutboxPublisherWorker` con Retry Policy.
- [x] **Hito 8: Auditoría Universal**
  - [x] Extensiones/Middleware de Prisma para DML.
- [x] **Hito 9: Logger + Observabilidad**
  - [x] Logger base corporativo (`pino`).
- [x] **Hito 10: Validación + Errores + DTOs**
  - [x] Clases `DomainException`, `BusinessException`.
  - [x] Helper Zod integrado.
- [x] **Hito 11: Seguridad + Contexto + Multitenancy**
  - [x] `RequestContext` builder.
- [x] **Hito 12: Testing + ESLint + ADR (Architecture Enforcement Layer)**
  - [x] ESLint rules restrictivas.
  - [x] Husky + lint-staged.
  - [x] Github Actions base.

# Fase 2: Seguridad y Multitenancy

- [x] **Hito 13: Módulo de Autenticación (Shared)**
  - [x] Interfaz `IAuthProvider`.
  - [x] Implementar `SupabaseAuthProvider`.
- [x] **Hito 14: Módulo de Seguridad (Security)**
  - [x] Crear Bounded Context (`src/modules/security/`).
  - [x] Esquema Prisma (Role, Permission, Policy).
  - [x] Comandos/Queries básicos.
- [x] **Hito 15: Middleware de Multitenancy (Prisma Extension)**
  - [x] Interceptor de Prisma para RLS en aplicación.
- [x] **Hito 16: Feature Flags**
  - [x] Tabla `feature_flags`.
  - [x] `FeatureFlagService`.

# Fase 3: Logística Inversa - Recepción

- [x] **Hito 17: Bounded Context de Logística**
  - [x] Scaffolding de `src/modules/logistica/`.
  - [x] `OrdenServicioAggregate` (Domain).
  - [x] Actualizar `schema.prisma` (Tablas Logística).
- [x] **Hito 18: Casos de Uso (Application)**
  - [x] DTOs con Zod.
  - [x] `CrearRecepcionCacCommand` / `CrearRecepcionPxCommand`.
- [x] **Hito 19: Repositorios y Mapper**
  - [x] `IOrdenServicioRepository`.
  - [x] `PrismaOrdenServicioRepository`.
- [x] **Hito 20: Refactor de UI (Strangler Fig)**
  - [x] Rutas API Next.js.
  - [x] Inyectar Feature Flag en `recepcion/page.tsx`.

# Fase 4: Producción y Servicio Técnico

- [x] **Hito 21: Bounded Context de Producción (Taller)**
  - [x] Scaffolding de `src/modules/produccion/`.
  - [x] Aggregates de Diagnóstico y Reparación.
  - [x] Actualizar `schema.prisma` (Tablas Taller).
- [x] **Hito 22: Comandos de Diagnóstico y Reparación (Write Model)**
  - [x] Implementar Comandos (`IniciarDiagnosticoCommand`, etc).
- [x] **Hito 23: CQRS - Proyecciones y Consultas (Read Model)**
  - [x] Implementar Queries (`GetProduccionDashboardQuery`).
- [x] **Hito 24: Migración Incremental de UI (Dashboard Producción)**
  - [x] Integrar Queries y Feature Flags en la UI.

# Fase 5: Inventario y Abastecimiento

- [x] **Hito 25: Bounded Context de Inventario**
  - [x] Scaffolding de `src/modules/inventario/`.
  - [x] `ArticuloAggregate` y `MovimientoInventarioAggregate`.
  - [x] Actualizar `schema.prisma`.
- [x] **Hito 26: Comandos de Inventario (Write Model)**
  - [x] `AjustarStockCommand` y `CrearArticuloCommand`.
- [x] **Hito 27: Event Handlers (Integración Asíncrona)**
  - [x] `ReparacionFinalizadaEventHandler` (Descontar stock).
  - [x] `RecepcionCreadaEventHandler` (Dar de alta).
- [x] **Hito 28: Dashboard y UI (Strangler Fig)**
  - [x] Queries de alto rendimiento (`GetInventarioValorizadoQuery`).
  - [x] Feature Flags y Rutas API en Next.js.

# Fase 6: Recursos Humanos (RRHH)

- [x] **Hito 29: Bounded Context de RRHH**
  - [x] Scaffolding de `src/modules/rrhh/`.
  - [x] `EmpleadoAggregate` y `AsistenciaAggregate`.
  - [x] Actualizar `schema.prisma`.
- [x] **Hito 30: Comandos de RRHH (Write Model)**
  - [x] `AltaEmpleadoCommand` y `RegistrarAsistenciaCommand`.
- [x] **Hito 31: Event Handlers (KPIs Asíncronos)**
  - [x] `DiagnosticoFinalizadoEventHandler`.
  - [x] `ReparacionFinalizadaEventHandler` (en RRHH).
- [x] **Hito 32: Interfaz de Usuario y CQRS**
  - [x] Queries `GetReporteAsistenciaQuery` y `GetRendimientoTecnicosQuery`.
  - [x] Migración de `ReportesTab.tsx`.

# Fase 7: Despacho (Salida)

- [x] **Hito 33: Bounded Context de Despacho**
  - [x] Scaffolding de `src/modules/despacho/`.
  - [x] `DespachoAggregate`.
  - [x] Actualizar `schema.prisma`.
- [x] **Hito 34: Comandos de Despacho (Write Model)**
  - [x] `CrearDespachoCommand` y `ConfirmarEntregaCommand`.
- [x] **Hito 35: Event Handlers (Orquestación Automática)**
  - [x] `ReparacionFinalizadaEventHandler` (creación de orden).
- [x] **Hito 36: Interfaz de Usuario y Strangler Fig**
  - [x] Query `GetDespachosPendientesQuery`.
  - [x] Integración en `src/app/(erp)/despacho/page.tsx`.

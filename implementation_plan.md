# Roadmap de Arquitectura Enterprise: Modular Monolith (DDD + CQRS)

## Meta Principal
Evolucionar el TC-ERP hacia un **Monolito Modular de grado Enterprise** (SaaS), aplicando principios estrictos de *Domain-Driven Design (DDD)*, *Clean Architecture*, y *CQRS*. Esta arquitectura asegura un sistema altamente escalable, mantenible y robusto, preparado para soportar múltiples empresas (Tenants), sucursales, y un alto volumen de transacciones sin la complejidad de red de los microservicios distribuidos.

---

## Principios Arquitectónicos Core

### 1. Separación Estricta de Capas
El proyecto se dividirá físicamente en 4 grandes bloques desde la raíz:
- **`src/app/`**: Únicamente capa de presentación y enrutamiento (Next.js).
- **`src/modules/`**: Contiene los Bounded Contexts (Ej. `logistica`, `produccion`, `rrhh`).
- **`src/shared/`**: El "Shared Kernel" fragmentado en responsabilidades únicas.
- **`src/infrastructure/`**: Implementaciones técnicas (Supabase, Email, Storage, etc).

### 2. Capa de Aplicación (Use Cases)
El flujo de datos será estrictamente: **UI → Application (Use Case) → Domain → Repository → Infrastructure**. Cada acción del ERP (Ej. `RegistrarEquipoUseCase`) es un caso de uso independiente y testeable.

### 3. Segregación de Responsabilidades (CQRS Ligero)
Separación explícita dentro de cada módulo:
- **Commands**: Lógica de escritura y reglas de negocio (`CrearEmpleado`, `DespacharEquipo`).
- **Queries**: Lógica de lectura optimizada y proyecciones (`BuscarSerie`, `Dashboard`).

### 4. Comunicación entre Módulos
Los módulos son dueños absolutos de sus datos (Tablas separadas por Aggregate, nunca compartidas).
- **Comunicación Síncrona**: A través de interfaces públicas explícitas (`modules/[nombre]/api/`). Un módulo NO puede importar desde la carpeta `internal/` de otro.
- **Comunicación Asíncrona**: A través de un **Event Bus Abstracto** (`IEventBus`), implementado inicialmente en memoria o Postgres, escalable a Kafka/RabbitMQ a futuro.

### 5. Resiliencia de Eventos (Event Sourcing & Outbox Pattern)
- **Event Sourcing Ligero**: Tabla transaccional `domain_events` para reconstruir la historia del sistema.
- **Outbox Pattern**: Toda transacción de dominio se guarda junto con su evento en la base de datos en el mismo commit. Un *worker* en background publicará el evento para garantizar que **nunca se pierdan eventos**.

### 6. Multitenancy Bidimensional & Soft Delete
**Toda tabla de dominio** incluirá obligatoriamente:
- `tenant_id` (Empresa, ej. TechComm, Empresa B)
- `branch_id` (Sucursal, ej. Zona 9, Quetzaltenango)
- Campos de Soft Delete (`is_deleted`, `deleted_at`, `deleted_by`) que los repositorios omitirán por defecto.

### 7. Persistencia Exclusiva con Prisma ORM
**Prisma ORM** será el único mecanismo autorizado para interactuar con PostgreSQL.
- Se prohíbe terminantemente el uso directo del cliente de Supabase para operaciones CRUD en el backend o frontend, SQL crudo o Server Components directos.
- Todo acceso pasa por `Prisma[Nombre]Repository` implementando una interfaz de Dominio (`I[Nombre]Repository`).
- Toda operación multi-tabla se ejecutará estrictamente mediante Prisma Transactions acopladas a la publicación de eventos en Outbox.

---

## 🏗 Estructura de Directorios

```text
src/
├── app/                  # UI, Rutas Next.js y Controladores
│   ├── (erp)/
│   │   ├── recepcion/
│   │   └── rrhh/
│
├── modules/              # Bounded Contexts (Lógica de Negocio Autónoma)
│   └── logistica/
│       ├── domain/       # Núcleo del Negocio
│       │   ├── entities/ # BaseEntity, EmpleadoEntity
│       │   ├── aggregates/ # BaseAggregate, OrdenServicioAggregate
│       │   ├── value-objects/ # Correo, NIT, NumeroSerie
│       │   ├── repositories/ # IEquipoRepository
│       │   ├── events/
│       │   └── services/
│       ├── application/  # Casos de Uso
│       │   ├── commands/ # Escribir datos
│       │   ├── queries/  # Leer datos
│       │   ├── handlers/ # IEventHandlers
│       │   └── dto/      # Data Transfer Objects
│       ├── infrastructure/ # Implementación técnica
│       │   ├── repositories/ # PrismaEquipoRepository
│       │   └── mappers/  # Prisma -> Domain -> DTO
│       ├── api/          # Interfaz Pública (Exportada)
│       └── ui/           # Componentes visuales del módulo
│
├── shared/               # Shared Kernel (Cross-Cutting Concerns)
│   ├── auth/
│   ├── audit/            # Auditoría Universal
│   ├── events/           # IEventBus, IEventHandler
│   ├── logger/           # Observabilidad, Tracing
│   ├── cache/            # ICacheProvider
│   ├── context/          # RequestContext (Tenant, Branch, User)
│   ├── errors/           # DomainException, BusinessException
│   ├── validation/       # Zod Helpers
│   └── types/            # IClock, IIdGenerator
│
├── infrastructure/       # Implementaciones globales
│   ├── database/prisma/
│   ├── storage/          # IStorageProvider (Supabase, S3)
│   ├── notifications/    # INotificationProvider (Email, WhatsApp)
│   └── hardware/         # IBiometricProvider, IPrinterProvider
│
├── workers/              # Procesos asíncronos (OutboxPublisherWorker)
├── tests/                # unit/, integration/, contract/
└── docs/adr/             # Architecture Decision Records
```

---

## 🗺 Roadmap de Implementación

### Fase 1: Fundamentos Core (Shared & Infrastructure)
- Configuración de la estructura base (`app`, `modules`, `shared`, `infrastructure`).
- **Implementación de Prisma ORM** en `src/infrastructure/database/prisma/` como único ORM autorizado.
- Generación de `schema.prisma` inicial con soporte nativo para **Multitenancy** (`tenant_id`, `branch_id`) y **Soft Delete** (`is_deleted`, `deleted_at`).
- Implementación de patrón `Repository` base y Dependency Injection framework.
- Implementación de `IEventBus` y tabla `domain_events` (Lightweight Event Sourcing).
- Implementación del **Outbox Pattern** integrado con Prisma Transactions.
- Módulo **Audit** (Tablas universales: `audit_logs`, `audit_changes`, `audit_errors`).
- **Logger y Observabilidad** (Métricas, Performance, Slow Queries).
- Configuración global de Errores y Validaciones (con **Zod**).

### Fase 2: Seguridad y Multitenancy
- Módulo **Security**: Configuración de Roles, Políticas y Permisos.
- Implementación de **Feature Flags** (Activación de módulos sin tocar código).
- Integración nativa de **Multitenancy**: `tenant_id` y `branch_id` en contextos base.
- Configuración de **Auth** en capa compartida.

### Fase 3: Logística Inversa (Recepción e Inventario)
- Refactorización de **Recepción** (Px y Cac) al estándar Application (Use Cases) y Domain.
- Segregación de Tablas por Aggregate.
- Módulos de **Bodega** e **Inventario**.

### Fase 4: Producción y Servicio Técnico
- Creación de Bounded Context para **Producción** y **Taller** (Diagnósticos, Reparaciones, Técnicos).
- Implementación de CQRS para reportes complejos.
- Módulo de **Calidad**.

### Fase 5: Logística de Salida
- Módulo de **Despacho** y Salidas.
- Integración con infraestructuras de **Courier** y **Tracking**.

### Fase 6: Recursos Humanos
- Refactorización a Módulo Enterprise de **RRHH** (Empleados, Asistencias, Vacaciones).
- Abstracción de integraciones de hardware (Biométrico) en la capa de `infrastructure`.

### Fase 7: Analítica Empresarial
- Módulo de **Business Intelligence (BI)**.
- Paneles de **Dashboards**, **KPIs** y Analytics.

---

## 🚨 Plan de Acción Inmediato: Corrección de Infraestructura Prisma (Auditoría)

Antes de continuar con el desarrollo de los hitos planificados, se ejecutará una auditoría y estabilización completa de la capa de acceso a datos, abordando de raíz el problema crítico de despliegue en Vercel detectado con Prisma.

**Respuestas a las consultas sobre el schema:**
- **¿Por qué desapareció la línea `url = env("DATABASE_URL")`?** No desapareció. Revisando el historial de git (commit `10b4d55`), el archivo fue creado desde el principio sin la propiedad `url`. Fue una omisión en el diseño inicial.
- **¿Fue eliminada en una refactorización?** No, el archivo nació así durante el andamiaje del Monolito Modular.
- **¿Se usa alguna característica experimental de Prisma 7?** No. El proyecto usa Prisma 7.8.0 en modo estándar. El motor lanza este error (comportamiento estricto por defecto) cuando detecta que el schema no posee una cadena de conexión incrustada y, a su vez, el desarrollador llama a `new PrismaClient()` sin proveerle opciones en tiempo de ejecución.

### Pasos de Estabilización (Ejecución Prioritaria):
1. **Corregir `schema.prisma`**: Agregar `url = env("DATABASE_URL")` al bloque `datasource db`.
2. **Regenerar Cliente**: Ejecutar `npx prisma generate` en local para asegurar que la tipificación se alinee con las variables de entorno.
3. **Refactorizar `client.ts`**: Mantener una inicialización limpia (`new PrismaClient()`) sin sobreescrituras innecesarias.
4. **Limpieza de Top-Level Side Effects**: Auditar y limpiar `src/app/api/inventario/dashboard/route.ts` y todas las Rutas API / Server Actions. Instanciar repositorios y servicios estrictamente dentro del handler o función ejecutora, nunca a nivel de módulo.
5. **Auditoría de Inyección de Dependencias**: Revisar la configuración del contenedor DI (Tsyringe) para evitar llamadas explícitas a `new Service(...)` en favor de la resolución dinámica del framework CQRS.

---

## 📋 Plan de Ejecución Detallado: Fase 1 Enterprise (12 Hitos)

Para garantizar la autonomía, seguridad y limpieza de la nueva arquitectura, la Fase 1 fundacional se ejecutará mediante 12 hitos secuenciales y estrictos.

### Hito 1: Estructura del proyecto
- Scaffolding de los directorios: `modules/`, `shared/`, `infrastructure/`, `workers/`, `tests/`, `docs/adr/`.
- Creación de los primeros ADR (Architecture Decision Records) documentando el Monolito Modular y Prisma.

### Hito 2: Prisma ORM
- Instalación e inicialización de Prisma (`npx prisma init`).
- Diseño del `schema.prisma` incorporando de fábrica `tenant_id`, `branch_id`, `is_deleted` y `version`.
- Generación de las tablas transversales: `domain_events`, `outbox_events`, `audit_logs`.

### Hito 3: BaseEntity + BaseAggregate + Value Objects
- Creación de clases abstractas `BaseEntity` y `BaseAggregate` en `shared/types/`.
- Tipificación de `Value Objects` recurrentes (`Email`, `DPI`, `Phone`, `SerialNumber`).
- Implementación de `IIdGenerator` (ULID/UUID) e `IClock` (SystemClock).

### Hito 4: Repository Pattern
- Creación de interfaces `IRepository<T>` en el Dominio.
- Implementación base `BasePrismaRepository<T>` en Infraestructura, interceptando nativamente filtros por *Tenant* y *Soft Delete*.
- Creación de la capa **Mapper** (`EntityMapper`) para prohibir la fuga de modelos Prisma hacia Dominio.

### Hito 5: Dependency Injection
- Configuración de contenedor IoC (`tsyringe` o similar).
- Auto-registro de repositorios y servicios sin instanciación manual (`new Class()`) dentro del Dominio.

### Hito 6: Event Bus + Event Handlers
- Contratos `IEventBus` e `IEventHandler`.
- Implementación `LocalEventBus`.

### Hito 7: Outbox Pattern + Worker + Retry
- Integración transaccional Prisma + Outbox (`outbox_events`).
- Construcción de `OutboxPublisherWorker` con *Retry Policy* (`attempts`, `last_error`, `next_retry`, `status`).

### Hito 8: Auditoría Universal
- Servicio transversal de Auditoría interceptando middleware de Prisma DML para llenar `audit_logs` y `audit_changes` automáticamente.

### Hito 9: Logger + Observabilidad
- Pino Logger corporativo.
- Performance Metrics y captura de Slow Queries.

### Hito 10: Validación + Errores + DTOs
- Estandarización de `DomainExceptions`, `BusinessExceptions`, `ValidationExceptions`.
- Zod integrándose con los DTOs de los Commands/Queries de la capa de Application.

### Hito 11: Seguridad + Contexto + Multitenancy
- Creación de `RequestContext` (`tenant`, `branch`, `user`, `roles`) accesible globalmente.

### Hito 12: Testing + ESLint + ADR (Architecture Enforcement Layer)
**Vital**: Garantizar que el sistema rechace violaciones arquitectónicas:
- Configuración de reglas estrictas de **ESLint** para bloquear importaciones de `/internal/` entre módulos.
- Implementación de **Husky + lint-staged**.
- Setup básico de CI (Ej. GitHub Actions) requiriendo `tsc --noEmit`, ESLint y validación Prisma antes de mergear.
- Configuración de `tests/unit` y `tests/integration`.

> [!CAUTION]
> **Regla de Refactorización Incremental (Patrón Strangler Fig)**
> La aplicación no se detendrá. Los módulos existentes seguirán funcionando bajo la ruta actual mientras el nuevo kernel y los módulos se construyen en paralelo. Las pantallas se irán enrutando gradualmente hacia la nueva estructura.

---

## 🔒 Plan de Ejecución Detallado: Fase 2 (Seguridad y Multitenancy)

### Hito 13: Módulo de Autenticación (Shared)
- Crear `src/shared/auth/` con interfaces de `IAuthProvider` y `AuthService`.
- Integrar Supabase Auth detrás de estas abstracciones para que el sistema de dominio no dependa directamente de Supabase.

### Hito 14: Módulo de Seguridad (Security)
- Crear el Bounded Context de seguridad (`src/modules/security/`).
- Diseñar entidades de `Rol`, `Permiso` y `Políticas` en el `schema.prisma`.
- Implementar casos de uso: `AssignRoleCommand`, `CheckPermissionQuery`.

### Hito 15: Middleware de Multitenancy (Prisma Extension)
- Crear una Extensión de Prisma (`Prisma Client Extension`) que intercepte todas las consultas (`findMany`, `findFirst`, `update`, `delete`) e inyecte automáticamente el `tenant_id` y `branch_id` extraídos del `RequestContext`.
- Validar que sea imposible realizar consultas cruzadas entre Tenants (Data Leakage Prevention).

### Hito 16: Feature Flags
- Crear la tabla `feature_flags` (por Tenant/Branch).
- Implementar el servicio `FeatureFlagService` en `src/shared/`.
- Permitir activar/desactivar la migración de módulos (Ej. "Usar nuevo módulo de recepción" on/off) sin redesplegar.

---

## 📦 Plan de Ejecución Detallado: Fase 3 (Logística Inversa - Recepción)

Con la base de datos segura y el framework de *Bounded Contexts* listo, iniciaremos la migración de la pantalla de Recepción utilizando el **Strangler Fig Pattern**.

### Hito 17: Bounded Context de Logística
- Crear `src/modules/logistica/`.
- Diseñar el `OrdenServicioAggregate` (Raíz de Agregado) que encapsulará Equipo, Diagnóstico inicial y Estado de Recepción.
- Definir el `schema.prisma` exclusivo para las tablas de este módulo (Ej. `log_ordenes`, `log_equipos`).

### Hito 18: Casos de Uso (Application)
- Extraer la lógica de los `handleSubmit` (actualmente acoplados en los componentes UI de Next.js).
- Crear `CrearRecepcionCacCommand` y `CrearRecepcionPxCommand` validando los DTOs mediante Zod.

### Hito 19: Repositorios y Mapper
- Crear `IOrdenServicioRepository`.
- Implementar `PrismaOrdenServicioRepository` asegurando que toda inserción publique un evento `RecepcionCreadaDomainEvent` a través del Outbox.

### Hito 20: Refactor de UI (Strangler Fig)
- En `src/app/(erp)/recepcion/page.tsx`, inyectar el Feature Flag `USE_NEW_RECEPTION_MODULE`.
- Si el flag está activo, la UI invocará a las APIs de Next.js (Rutas API) que a su vez delegarán la ejecución a los *Use Cases* de la capa de Application (`CrearRecepcionCacCommand`).
- Si no está activo, usará el código legado. Esto garantiza cero regresiones.

---

## 🛠️ Plan de Ejecución Detallado: Fase 4 (Producción y Servicio Técnico)

El corazón del ERP es el control de reparación y taller. Esta fase aislará esa complejidad del resto del sistema, enfocándose fuertemente en CQRS para reportes complejos.

### Hito 21: Bounded Context de Producción (Taller)
- Crear el módulo `src/modules/produccion/`.
- Definir Aggregates clave: `DiagnosticoAggregate`, `ReparacionAggregate`.
- Añadir a `schema.prisma` las tablas relacionadas a órdenes de trabajo, técnicos y estados de taller.

### Hito 22: Comandos de Diagnóstico y Reparación (Write Model)
- Modelar Casos de Uso de escritura robustos: `IniciarDiagnosticoCommand`, `RegistrarRepuestoCommand`, `FinalizarReparacionCommand`.
- Integrar con el *Outbox Pattern* para notificar al módulo de Inventario sobre la reserva y consumo de repuestos.

### Hito 23: CQRS - Proyecciones y Consultas (Read Model)
- Crear Queries optimizados usando SQL directo (vía `$queryRaw` o proyecciones Prisma): `GetProduccionDashboardQuery`, `GetRendimientoTecnicosQuery`.
- Evitar cargar los Aggregates de Dominio completos cuando solo se necesiten datos planos para los reportes de KPIs.

### Hito 24: Migración Incremental de UI (Dashboard Producción)
- Conectar los nuevos Queries a las pantallas existentes (`/produccion/dashboard`).
- Implementar Feature Flags (`USE_NEW_PROD_DASHBOARD`, `USE_NEW_REPAIR_FLOW`) para redirigir los endpoints en los componentes actuales de React.

---

## 🛠️ Plan de Ejecución Detallado: Fase 5 (Inventario y Abastecimiento)

El módulo de Inventario es vital porque actúa como punto de encuentro entre **Logística** (Ingresos) y **Producción** (Consumos). Su complejidad radica en la sincronización y la integridad referencial. Usaremos *Event-Driven Architecture* para comunicar el inventario con el resto del sistema sin acoplarlo directamente a los otros módulos.

### Hito 25: Bounded Context de Inventario
- Crear el módulo `src/modules/inventario/`.
- Definir Aggregates clave: `ArticuloAggregate` (repuestos o equipos) y `MovimientoInventarioAggregate`.
- Añadir tablas a `schema.prisma` (`InvArticulo`, `InvMovimiento`, `InvAlmacen`).

### Hito 26: Comandos de Inventario (Write Model)
- Modelar Comandos: `CrearArticuloCommand`, `RegistrarMovimientoCommand`, `AjustarStockCommand`.
- Definir las validaciones estrictas (`Zod`) para evitar movimientos con stock negativo.

### Hito 27: Event Handlers (Integración Asíncrona)
- Crear el `ReparacionFinalizadaEventHandler` en el módulo de Inventario que escuche los eventos del módulo de **Producción**. 
- **Regla de Negocio:** *No todos los equipos que van a reparación necesitan cambio de partes.* El EventHandler analizará el payload del evento; si la reparación se finalizó sin requerir refacciones, el EventHandler simplemente ignorará el evento sin afectar el stock. Si contiene partes, las descontará automáticamente.
- Crear el `RecepcionCreadaEventHandler` que escuche a **Logística** para dar de alta provisional los equipos que ingresen.

### Hito 28: Dashboard y UI (Strangler Fig)
- Implementar Queries de alto rendimiento: `GetInventarioValorizadoQuery`, `GetStockCriticoQuery`.
- Inyectar los Feature Flags (`USE_NEW_INVENTORY_MODULE`) en las pantallas actuales de `/inventario` o `/bodega` para migrar la tabla principal y los reportes.

---

## 🛠️ Fase 0.1: Estabilización de Build (Hotfix reflect-metadata)

> [!WARNING]
> **Bloqueante Actual:** El empaquetado estático de Vercel/Next.js falla ("Failed to collect page data") porque Tsyringe no encuentra el polyfill `reflect-metadata` al evaluar los decoradores `@injectable` en los repositorios.

### 1. Dónde debe cargarse `reflect-metadata`
En **Next.js App Router**, cada `route.ts` y `page.tsx` es tratado como un *entrypoint* independiente por Turbopack/Webpack. Para que `reflect-metadata` funcione:
1. Debe estar en el árbol de dependencias del entrypoint.
2. Debe ser la **primera línea importada**, antes de que cualquier otro módulo importe una clase con el decorador `@injectable()`.

### 2. Propuesta de Soluciones

#### Opción A: Solución Mínima (Hotfix Seguro)
Agregar `import 'reflect-metadata';` como la **primera línea absoluta** en todos los `route.ts` existentes que interactúen directa o indirectamente con los servicios del dominio.
- **Ventaja:** Cero impacto arquitectónico. Resuelve el build de inmediato.
- **Desventaja:** Hay que recordar ponerlo en cada ruta nueva.

#### Opción B: Solución Recomendada (Bootstrap Centralizado)
Crear un archivo `src/shared/di/bootstrap.ts`:
```typescript
import 'reflect-metadata';
import { container } from 'tsyringe';
export { container };
```
Y obligar a las rutas a importar sus dependencias desde este `bootstrap.ts` en lugar de importar `tsyringe` crudo.
- **Ventaja:** Garantiza que el polyfill se carga siempre que se llame al contenedor. Sienta las bases para el Hito 5.

### 3. Alcance Explícito de Modificaciones

**Archivos a Modificar (Basado en Opción A - Hotfix para pasar a verde):**
- `src/app/api/inventario/dashboard/route.ts`
- `src/app/api/produccion/dashboard/route.ts`
- `src/app/api/despacho/pendientes/route.ts`
- `src/app/api/rrhh/dashboard/route.ts`
- `src/app/api/recepcion/route.ts` *(Ya corregido en el paso anterior)*

**Archivos que NO deben modificarse:**
- `src/infrastructure/database/prisma/client.ts` (No acoplar DB con el contenedor de DI).
- Ningún repositorio en `src/modules/*/infrastructure/`.
- Ningún servicio de dominio o aplicación.

**Riesgos:**
Si el `import 'reflect-metadata';` se coloca en la línea 3 (después de importar un Query o un Repository), el módulo importado se evalúa primero, disparando el decorador `@injectable()` antes del polyfill y causando un crash instantáneo en Vercel.

### 4. Checklist de Ejecución
- [x] Insertar `import 'reflect-metadata';` en la **Línea 1** de los 4 `route.ts` pendientes.
- [x] Ejecutar `npm run build` localmente para validar.
- [x] Confirmar que el paso *Collecting page data* finaliza en verde sin lanzar `Error: tsyringe requires a reflect polyfill`.

---

## 🏗️ Fase 1.1: Avanzar a Arquitectura CQRS Base

> [!NOTE]
> Tras haber congelado la infraestructura Prisma y limpiado la inyección de dependencias residual con TSyringe, el sistema está listo para dar el salto arquitectónico hacia CQRS (Command Query Responsibility Segregation). 

### 1. Objetivo
Desacoplar completamente las capas de presentación (Next.js API Routes) de la lógica de aplicación y dominio mediante el uso de **Buses de Comandos y Consultas**. Las rutas ya no resolverán directamente Casos de Uso (`container.resolve(Comando)`), sino que enviarán mensajes a un Bus centralizado.

### 2. Estructura Propuesta (Nuevas Interfaces)
Crearemos el directorio `src/shared/cqrs/` con los contratos fundamentales:
- `ICommand` e `IQuery`: Interfaces marcador para los payloads.
- `ICommandHandler<C, R>` e `IQueryHandler<Q, R>`: Interfaces que los módulos DDD implementarán.
- `ICommandBus` e `IQueryBus`: Contratos para el despacho de mensajes.

### 3. Implementación del Bus (TSyringe)
Desarrollaremos un `TSyringeCommandBus` y un `TSyringeQueryBus` que:
1. Reciba el comando (ej. `new CrearRecepcionCacCommand(payload)`).
2. Obtenga el nombre de la clase/token.
3. Use `container.resolve()` para instanciar el Handler dinámicamente.
4. Ejecute el Handler devolviendo el resultado.

### 4. Refactorización Inicial (Prueba de Concepto en Recepción)
Para validar el diseño sin romper el sistema completo, refactorizaremos el módulo de Logística / Recepción:
#### [MODIFY] `src/modules/logistica/application/commands/CrearRecepcionCacCommand.ts`
- Se convertirá en un payload de datos puro (`export class CrearRecepcionCacCommand implements ICommand`).
- El código de negocio se moverá a un Handler (`export class CrearRecepcionCacHandler implements ICommandHandler`).
- Se registrará el Handler en el contenedor TSyringe.

#### [MODIFY] `src/app/api/recepcion/route.ts`
- Eliminará las referencias directas a repositorios y handlers.
- Obtendrá el `ICommandBus` inyectado.
- Ejecutará: `await commandBus.execute(new CrearRecepcionCacCommand(...payload))`

### 5. Verification Plan
- **Validación Estática:** Compilación limpia y sin fallos de ESLint.
- **Validación de Runtime:** `npm run build` en verde.
- **Validación Funcional (Opcional):** Ejecutar una prueba POST hacia `/api/recepcion` usando Postman/ThunderClient (o script curl automatizado) para garantizar que el CommandBus resuelve y ejecuta el handler.

## User Review Required
¿Apruebas la creación de las interfaces `shared/cqrs`, la implementación del Bus basado en TSyringe y la refactorización de prueba en el endpoint de Recepción? Si el patrón te parece adecuado, procederé a ejecutarlo.

---

## 🛠️ Plan de Ejecución Detallado: Fase 6 (Recursos Humanos - RRHH)

El módulo de Recursos Humanos es responsable de la gestión de personal, asistencia y medición de rendimiento. Operará como un Bounded Context independiente. Al aplicar Event-Driven Architecture, este módulo podrá escuchar eventos de Producción para nutrir los KPIs de los técnicos automáticamente sin acoplar las bases de datos.

### Hito 29: Bounded Context de RRHH
- Crear el scaffolding en `src/modules/rrhh/`.
- Definir Aggregates base: `EmpleadoAggregate` y `AsistenciaAggregate`.
- Añadir tablas al `schema.prisma`: `RrhhEmpleado`, `RrhhAsistencia`, `RrhhDesempeno`.

### Hito 30: Comandos de RRHH (Write Model)
- Modelar Comandos: `AltaEmpleadoCommand`, `RegistrarAsistenciaCommand`.
- Manejo estricto de roles y estado activo/inactivo (Soft Delete o deactivation).

### Hito 31: Event Handlers (KPIs Asíncronos)
- Implementar `DiagnosticoFinalizadoEventHandler` y `ReparacionFinalizadaEventHandler` dentro de RRHH.
- **Regla de Negocio:** Cuando Producción finaliza un trabajo, RRHH escucha el evento e incrementa los KPIs del empleado (ej. "Equipos reparados este mes") en la tabla de desempeño, manteniendo estadísticas ultra rápidas sin recálculos pesados.

### Hito 32: Interfaz de Usuario y CQRS
- Implementar Queries: `GetReporteAsistenciaQuery` y `GetRendimientoTecnicosQuery`.
- Inyectar lógica de CQRS mediante Feature Flag (`USE_NEW_RRHH_MODULE`) en los componentes existentes como `src/app/(erp)/rrhh/components/ReportesTab.tsx`.

---

## 🛠️ Plan de Ejecución Detallado: Fase 7 (Despacho)

El módulo de Despacho representa el paso final del ciclo de vida del servicio. Se encarga de empaquetar, rutear y entregar el equipo reparado (o irreparable) de vuelta al cliente. Al ser un módulo impulsado por eventos (Event-Driven), su "Bandeja de Salida" se nutrirá automáticamente cuando Producción finalice su trabajo.

### Hito 33: Bounded Context de Despacho
- Crear el scaffolding en `src/modules/despacho/`.
- Definir Aggregates base: `DespachoAggregate`.
- Añadir tablas al `schema.prisma`: `DespachoOrden`.

### Hito 34: Comandos de Despacho (Write Model)
- Modelar Comandos: `CrearDespachoCommand`, `ConfirmarEntregaCommand`.
- Estados del despacho: `PENDIENTE`, `EN_RUTA`, `ENTREGADO`.

### Hito 35: Event Handlers (Orquestación Automática)
- Implementar `ReparacionFinalizadaEventHandler` dentro de Despacho.
- **Regla de Negocio:** Cuando el taller termina de reparar (con o sin éxito), este evento crea automáticamente una orden de Despacho en estado `PENDIENTE` asignada al cliente, eliminando la necesidad de pasar el equipo manualmente de un módulo a otro.

### Hito 36: Interfaz de Usuario y Strangler Fig
- Implementar Queries: `GetDespachosPendientesQuery`.
- Inyectar Feature Flag (`USE_NEW_DESPACHO_MODULE`) en la vista `src/app/(erp)/despacho/page.tsx` para mostrar la lista viva de equipos listos para ser ruteados.

## User Review Required
> [!IMPORTANT]
> **Aprobación de Fase 7:** ¿Estás de acuerdo con automatizar la creación de Órdenes de Despacho en cuanto Producción termine su trabajo, usando eventos asíncronos? Esto agilizará la logística de salida.

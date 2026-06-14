# Arquitectura: Golden Template del TC-ERP (v1.0.0)

Esta plantilla es el estándar oficial para estructurar cualquier módulo de dominio dentro del sistema (ej: `recepcion`, `inventario`, `despacho`). Todo nuevo dominio **DEBE** copiar esta estructura al pie de la letra, sin alteraciones ni frameworks mágicos extra.

## Estructura Base de Directorios

Cada módulo debe vivir dentro de `src/modules/{nombre_modulo}` y debe contener obligatoriamente 4 capas:

```text
src/modules/[nombre_modulo]/
├── application/         # Lógica de aplicación y orquestación
│   ├── commands/        # Commands y Handlers (AccionEntidadCommand, AccionEntidadHandler)
│   ├── queries/         # Queries y Handlers (GetEntidadQuery, GetEntidadHandler)
│   ├── dto/             # Esquemas de Zod (validación de payloads de comandos)
│   ├── events/          # Handlers de eventos de dominio consumidos (ReaccionEventHandler)
│   └── cqrs/            # (Opcional) Interfaces base CQRS si el módulo es el owner (actualmente viven en recepcion/application/cqrs)
├── domain/              # Lógica pura de negocio y definiciones
│   ├── aggregates/      # Entidades raíz que mantienen consistencia (Ej: RecepcionAggregate)
│   ├── events/          # Definición de Domain Events (Ej: RecepcionCreatedEvent)
│   └── repositories/    # Interfaces de repositorios (Ej: I[Entidad]Repository)
├── infrastructure/      # Implementaciones concretas de la infraestructura
│   ├── repositories/    # Implementación de los repositorios en Prisma (Prisma[Entidad]Repository)
│   └── mappers/         # (Opcional) Mapeo entre Aggregate y Entidad Prisma
└── interfaces/          # Punto de entrada primario (Adaptadores)
    └── [Modulo]Controller.ts # Extrae el body de Next.js, valida FeatureFlags y delega al CommandBus/QueryBus
```

## Reglas Obligatorias (The Golden Rules)

### 1. El Patrón "Thin Adapter" en Next.js
Los archivos de Next.js `route.ts` deben mantenerse anémicos y vivir en `src/app/api/...`. No pueden contener lógica de Feature Flags, parsing complejo, ni lógica de dominio. Solo deben inyectar y llamar al Controller.

**Ejemplo correcto (`src/app/api/recepcion/route.ts`):**
```typescript
import 'reflect-metadata';
import { container } from '../../../shared/di/container';
import { RecepcionController } from '../../../modules/recepcion/interfaces/RecepcionController';

export async function POST(req: Request) {
  return container.resolve(RecepcionController).handle(req);
}
```

### 2. El Controller Orchestador (Sin Negocio)
El Controller vive en `modules/[modulo]/interfaces/`. Su única responsabilidad es parsear la request HTTP, construir el contexto (`RequestContext`), verificar **Feature Flags** (para el patrón Strangler Fig), y despachar el Command o Query al bus correspondiente.

### 3. Nomenclatura Estándar (Híbrida: Spanglish)
El TC-ERP utiliza una nomenclatura híbrida que mezcla el verbo en inglés con el sustantivo del dominio en español.
- **Commands**: `[VerboIngles][Entidad][Tipo?]Command` -> Ejemplo: `CreateRecepcionCommand`
- **Queries**: `Get[Entidad][Tipo?]Query` -> Ejemplo: `GetInventarioValorizadoQuery`
- **Eventos**: `[Entidad][AccionPasadoIngles]Event` -> Ejemplo: `RecepcionCreatedEvent`
- **Handlers**: Mismo nombre que el comando/query/evento agregando `Handler` -> `CreateRecepcionHandler`

### 4. Commands Inocentes y Lógica en el Aggregate
**Un Command sólo transporta la intención**, NUNCA es bifurcado por variantes de canal/UI de forma separada a menos que representen intenciones de negocio abismalmente diferentes.
- **Incorrecto:** `CrearRecepcionCacCommand` y `CrearRecepcionPxCommand`.
- **Correcto:** `CreateRecepcionCommand` con un parámetro `tipo: 'CAC' | 'PX'`.

El **Handler NO es el lugar para bifurcar lógica pesada ni ifs masivos**. Su deber es inyectar repositorios, recuperar o inicializar el Aggregate, y guardarlo.
La verdadera lógica de validación, bifurcación y regla de negocio vive en el **Aggregate**.

**Ejemplo correcto:**
```typescript
// En CreateRecepcionHandler
const orden = OrdenServicioAggregate.create(id, tenant, branch, command.tipo, command.payload);
await this.repository.save(orden);
for (const event of orden.getDomainEvents()) {
  await this.eventBus.emit(event);
}
```

### 5. Inyección de Dependencias (TSyringe) Explicitamente Controlada
Debido a que `Turbopack` y Vercel fallan con auto-discovery y reflection en decoradores anidados, **todos los handlers deben ser registrados explícitamente a mano en `src/shared/di/container.ts`**.
**REGLA:** Nunca usar scanning automático. Siempre hacer `container.register('Nombre', { useClass: Nombre });`. Además, **las interfaces DEBEN importarse como `import type { IInterface }`** para evitar errores `Module has no exports` en el build de Next.js.

### 6. Aislamiento de Dominio (Domain Isolation Rule)
**Un módulo NUNCA debe importar lógica de otro módulo directamente.** 
- **Incorrecto:** Que `Inventario` importe `RecepcionAggregate` o un DTO de Recepción.
- **Correcto:** Comunicación puramente basada en Eventos. `Recepcion` emite `RecepcionCreatedEvent`. `Inventario` lo captura a través del EventBus usando un handler dentro de su propia carpeta `application/events/`.
Solo se permite compartir contratos abstractos o dependencias de infraestructura a través del `Shared Kernel` (ej: `ICommand`, `RequestContext`).

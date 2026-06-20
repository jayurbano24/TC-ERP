# Guía de layout hexagonal — TC-ERP

**Versión:** 1.0 | **ADR:** ADR-004  
**Audiencia:** Todo desarrollo nuevo y migración Strangler.

---

## 1. Estructura estándar por módulo

Ubicación física: `src/modules/{bounded-context}/`

```
src/modules/sap-transfer/
├── domain/                          # NÚCLEO — cero dependencias externas
│   ├── entities/
│   │   └── sap-transfer-document.entity.ts
│   ├── value-objects/
│   │   └── sap-document-number.vo.ts
│   ├── enums/
│   │   └── sap-transfer-status.enum.ts
│   ├── rules/                       # Reglas puras (funciones o domain services)
│   │   └── validate-sap-document-required.rule.ts
│   ├── events/
│   │   └── equipment-classified.event.ts
│   └── ports/                       # Interfaces (driven ports)
│       ├── sap-transfer.repository.port.ts
│       └── classify-batch.gateway.port.ts   # RPC / transacción externa
│
├── application/                     # CASOS DE USO
│   ├── commands/
│   │   ├── classify-equipment-batch.command.ts
│   │   └── classify-equipment-batch.handler.ts
│   ├── queries/
│   │   └── get-sap-transfer-by-series.handler.ts
│   └── ports/                       # Driving ports hacia otros contextos (opcional)
│       └── returns-block.port.ts    # Lo que returns necesita de sap-transfer
│
├── infrastructure/                  # ADAPTADORES SALIDA (driven)
│   ├── persistence/
│   │   ├── supabase-sap-transfer.repository.ts
│   │   └── sap-transfer.mapper.ts
│   ├── rpc/
│   │   └── classify-equipment-batch.rpc.adapter.ts
│   └── legacy/
│       └── sap-transfer.legacy-bridge.ts   # Delega a lib/database durante Strangler
│
├── interfaces/                      # ADAPTADORES ENTRADA (driving)
│   ├── api/
│   │   └── classify-batch.route-handler.ts
│   └── hooks/
│       └── use-classify-batch.ts            # Para page.tsx React
│
└── index.ts                         # Barrel: solo exports públicos del módulo
```

**Documentación del módulo** vive en `docs/modules/{bounded-context}/` (no en `src/`).

---

## 2. Puertos y adaptadores — mapa TC-ERP

### 2.1 Driving adapters (quién llama al sistema)

| Adaptador | Ubicación típica | Ejemplo |
|-----------|------------------|---------|
| Página React | `src/app/(erp)/**/page.tsx` | Backoffice manifiesto |
| API Route Next.js | `src/app/api/**/route.ts` | `/api/recepcion` |
| API REST v1 (futuro) | `src/app/api/v1/**` | ADR-003 Centro Documentos |
| Worker / cron | `src/jobs/**` | Sync SAP batch |
| Event handler | `application/events/*Handler.ts` | `RecepcionCreated` → inventario |

**Regla:** adaptador de entrada **solo**:
1. Parsea input (HTTP, form, event payload)
2. Construye `RequestContext`
3. Invoca **un** handler / use case
4. Mapea resultado a respuesta UI/JSON

### 2.2 Driven adapters (a quién llama el sistema)

| Port (interface) | Adapter (implementación) | Tecnología |
|------------------|--------------------------|------------|
| `ISapTransferRepository` | `SupabaseSapTransferRepository` | Supabase client |
| `IClassifyBatchGateway` | `ClassifyEquipmentBatchRpcAdapter` | PostgreSQL RPC |
| `ISapTransferRepository` (fase 1) | `SapTransferLegacyBridge` | `lib/database/sapTransfers.ts` |
| `IEventPublisher` | `SupabaseEventOutbox` / `LocalEventBus` | Eventos dominio |
| `IZKTecoDevicePort` | `ZKTecoHttpAdapter` | RRHH biométrico |
| `IDocumentCenterPort` | `DocumentCenterHttpAdapter` | API externa futura |

---

## 3. Comunicación entre módulos (anti-acoplamiento)

**Prohibido:** `import { SupabaseXRepository } from '../other-module/infrastructure/...'`

**Correcto — 3 patrones:**

### A. Port publicado (síncrono)

```typescript
// returns/domain/ports/sap-transfer-lookup.port.ts
export interface ISapTransferLookupPort {
  getDocumentById(id: string): Promise<SapTransferSummary | null>;
}

// sap-transfer/infrastructure/exports/sap-transfer-lookup.adapter.ts
// Implementa ISapTransferLookupPort — registrado en DI
```

### B. Domain event (asíncrono desacoplado)

```typescript
// sap-transfer/domain/events/equipment-classified.event.ts
export class EquipmentClassifiedEvent implements DomainEvent { ... }

// finance-costing/application/events/on-equipment-dispatched.handler.ts
```

### C. Shared kernel mínimo

Solo en `src/shared/domain/` o `src/shared/cac-agency/`:
- `RequestContext`, `DomainEvent`, `BaseEntity`
- Utilidades sin reglas de negocio de un solo módulo

**No** poner reglas SAP en shared.

---

## 4. Legacy bridge (Strangler)

Durante Fase 1–2, el caso de uso **no** importa legacy directamente:

```typescript
// application/commands/classify-equipment-batch.handler.ts
@injectable()
export class ClassifyEquipmentBatchHandler {
  constructor(
    @inject('IClassifyBatchGateway') private readonly gateway: IClassifyBatchGateway,
    @inject('FeatureFlagService') private readonly flags: FeatureFlagService,
  ) {}

  async execute(cmd: ClassifyEquipmentBatchCommand, ctx: RequestContext) {
    // Dominio valida precondiciones
    const policy = validateClassificationPolicy(cmd.items);
    if (!policy.ok) throw new DomainError(policy.reason);

    // Gateway = RPC nuevo O legacy según flag
    return this.gateway.execute(cmd, ctx);
  }
}
```

```typescript
// infrastructure/legacy/sap-transfer.legacy-bridge.ts
export class ClassifyBatchLegacyGateway implements IClassifyBatchGateway {
  async execute(cmd, ctx) {
    return classifyEquipmentBatch(cmd.sapTransferId, cmd.items); // lib/database
  }
}
```

Al activar RPC atómica: registrar `ClassifyBatchRpcGateway` en DI en lugar del legacy.

---

## 5. Inyección de dependencias

Archivo central: `src/shared/di/container.ts` (o `container/modules/sap-transfer.ts` cuando crezca).

Patrón por módulo:

```typescript
// Registrar PORT → ADAPTER
container.register('ISapTransferRepository', {
  useClass: process.env.USE_HEXAGONAL_SAP_TRANSFER === 'true'
    ? SupabaseSapTransferRepository
    : SapTransferLegacyRepository,
});
container.register('ClassifyEquipmentBatchHandler', { useClass: ClassifyEquipmentBatchHandler });
```

**Pages y API routes** resuelven handlers desde container, no instancian repos.

---

## 6. Mapeo bounded context → carpeta

| Bounded context (docs) | Carpeta `src/modules/` | Legacy `lib/database/` |
|------------------------|------------------------|-------------------------|
| `sap-transfer` | `sap-transfer/` (crear) | `sapTransfers.ts` |
| `returns` | `returns/` (crear) | `returns.ts` |
| `logistics-reception` | `recepcion/` (existe) | `receptions.ts` |
| `outbound-dispatch` | `despacho/` (parcial) | `warehouse.ts` |
| `warehouse` | `inventario/` (parcial) | `warehouse.ts` |
| `workshop` | `produccion/` (parcial) | `workshop.ts` |
| `finance-costing` | `finance-costing/` (crear) | `costs.ts` |
| `accessories-dispatch` | extender `inventario/` o nuevo | `accessories.ts` |
| `production-order` | `production-order/` (crear) | — |
| `reporting` | `reporting/` (crear) | — (providers leen otros módulos) |
| `rrhh-hrms` | `rrhh/` (existe) | — |
| `platform` | `security/` (parcial) | `audit.ts`, `roles.ts` |

---

## 7. Página React — patrón thin UI

```typescript
// ❌ Hoy (backoffice) — anti-patrón
import { classifyEquipmentBatch } from '@/lib/database/sapTransfers';
// ... 4000 líneas con reglas mezcladas

// ✅ Objetivo
import { useClassifyBatch } from '@/modules/sap-transfer/interfaces/hooks/use-classify-batch';

export function ClassificationPanel() {
  const { classify, isLoading, error } = useClassifyBatch();
  // solo estado UI, validación de formulario superficial, llamada al hook
}
```

El hook llama API route o handler inyectado — **nunca** Supabase directo.

---

## 8. Testing por capa

| Capa | Qué testear | Dependencias |
|------|-------------|--------------|
| `domain/rules` | Reglas puras | Ninguna — Jest/Vitest unit |
| `application/handlers` | Orquestación | Mock ports |
| `infrastructure` | Mappers, SQL | Test integración / Supabase local |
| `interfaces` | Contrato HTTP | E2E ligero |

---

## 9. Checklist PR (hexagonal)

- [ ] ¿Hay regla de negocio nueva? → Solo en `domain/`
- [ ] ¿`domain/` importa supabase/next/react? → **Rechazar**
- [ ] ¿`page.tsx` importa `lib/database`? → Solo si CHG explícito legacy; si no, rechazar
- [ ] ¿Acceso cross-módulo? → Port o evento, no repo concreto
- [ ] ¿Nuevo adaptador externo? → Implementa port en `infrastructure/`
- [ ] ¿Feature flag para Strangler? → Documentado en CHG
- [ ] ¿DI registrado en `container.ts`?

---

## 10. Roadmap físico (sin big-bang)

| Orden | Acción | Resultado |
|-------|--------|-----------|
| 1 | Crear `modules/sap-transfer/` con domain + ports + legacy bridge | CHG-001 sin tocar UI |
| 2 | Hook `use-classify-batch` en backoffice (flag off por default) | UI thin incremental |
| 3 | Repetir returns con `ISapTransferLookupPort` | Desacoplamiento devoluciones |
| 4 | Nuevos módulos (PO, dispatch_batches) solo hexagonal | Cero deuda nueva |
| 5 | Deprecar `lib/database/sapTransfers.ts` cuando flag 100% | Fin Strangler módulo |

---

## Referencias

- ADR-004
- Ejemplo funcional parcial: `src/modules/recepcion/`
- DI: `src/shared/di/container.ts`
- Feature flags: `src/shared/feature-flags/FeatureFlagService.ts`

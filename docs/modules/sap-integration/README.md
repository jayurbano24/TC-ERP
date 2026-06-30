# Módulo: sap-integration

| Campo | Valor |
|-------|-------|
| **Bounded context** | `sap-integration` |
| **Responsabilidad** | Reglas de validación SAP y gate operativo (despacho / traslado) |
| **Dueño datos** | `sap_validation_runs`, `sap_validation_details` (carga CSV — futuro) |
| **Fase ADR-001** | 2B (P0) |
| **Estado** | Parcial — port de validación + gate implementados; carga/matching CSV pendiente |

---

## Propósito

Centraliza la **matriz de bloqueos SAP**: dado el estado de integración SAP de un
equipo (y de sus series S1–S4), decide si una unidad puede **despacharse** o
**trasladarse**. Es la fuente única de verdad que gobierna el *gate* de salida.

Estados SAP (`SapValidationState`):

| Estado | Despacho | Traslado |
|--------|----------|----------|
| `Validado SAP` | ✅ | ✅ |
| `Pendiente Validación` | ❌ | ✅ |
| `Sin Coincidencia` | ❌ | ❌ |
| `Pendiente Revisión` | ❌ | ❌ |
| `Obsoleto` | ❌ | ❌ |

---

## Arquitectura (implementado)

```
src/modules/sap-integration/
  domain/
    sap-validation-status.ts        # Reglas puras (estados, normalización, matriz de bloqueos)
    ports/sap-validation.port.ts     # ISapValidationReader (port de LECTURA)
  application/
    sap-validation.reader.ts         # DefaultSapValidationReader + singleton `sapValidationReader`
    sap-validation.reader.test.ts    # Tests del gate
  index.ts                           # API pública
```

### Port: `ISapValidationReader`

```ts
resolveStatus(input): SapValidationState
authorize(input, 'dispatch' | 'transfer'): SapGateDecision
```

Los consumidores dependen de la interfaz, no de la implementación. Hoy la
implementación es **in-process** sobre reglas puras; mañana podría leer
directamente de la integración SAP (ADR-004) sin tocar los gates.

### Consumidores del gate

- `/(erp)/despacho` — bloqueo de despacho por equipo (reemplaza chequeo inline duplicado).
- `/(erp)/bodega/gestion` — bloqueo de despacho/traslado por serie.

`@/lib/sap/sapValidationStatus` re-exporta el dominio por compatibilidad con los
consumidores existentes (badges, historial, reportes).

---

## Pendiente (no implementado)

- **C2B-11** — Carga CSV SAP, matching contra TC y persistencia de
  `sap_validation_runs` / `sap_validation_details`.
- Providers de reportes `SAP_DIFERENCIAS`, `SAP_NO_VALIDADOS`.
- **D2B-01** — documentación completa de los casos de uso de carga/matching.

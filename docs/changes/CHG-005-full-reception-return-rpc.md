# CHG-005 — RPC atómica `full_reception_return_tx`

## Metadatos

| Campo | Valor |
|-------|-------|
| **ID cambio** | CHG-005 |
| **Título** | Transacción atómica para devolución de lote completo (recepción) |
| **Módulo(s)** | `returns` |
| **Fase ADR-001** | **1** |
| **Capas hexagonal** | `infrastructure` (RPC adapter) |
| **Autor** | Arquitectura TC-ERP |
| **Fecha** | 2026-06-18 |
| **Estado** | **Implementado** — aplicar migración 031 en Supabase; flag off por default |

---

## 1. Descripción

Hoy `processFullReceptionReturn()` actualiza cada serie con `Promise.all` y luego la recepción en llamadas separadas. Si falla el update de recepción, las series pueden quedar `returned` sin que el lote esté `DEVUELTO`.

Este cambio introduce `full_reception_return_tx`: **una transacción** para todas las series + recepción (R-RN-20–24, R-031). Wrapper Strangler con flag `USE_ATOMIC_FULL_RECEPTION_RETURN`.

---

## 2. Reglas de negocio afectadas

| ID regla | Descripción | ¿Cambia comportamiento? |
|----------|-------------|-------------------------|
| R-RN-20 | Recepción existe | No |
| R-RN-21 | Al menos 1 serie | No |
| R-RN-22 | Todas series → returned | No |
| R-RN-23 | Reception → DEVUELTO | No |
| R-RN-24 | Notes en series | No — mismo prefijo `--- DEVOLUCIÓN ---` |
| **R-031** | Fallo = rollback completo | **Sí** |

---

## 3. Tablas y relaciones

| Tabla | Operación | Migración |
|-------|-----------|-----------|
| `receptions` | SELECT + UPDATE | `031_full_reception_return_tx.sql` |
| `series` | SELECT + UPDATE (N) | misma |
| `erp_audit_logs` | INSERT | App layer post-RPC |

### Firma RPC

```sql
full_reception_return_tx(
  p_reception_id uuid,
  p_motivo text,
  p_guia_salida text,
  p_user text,
  p_observaciones text DEFAULT NULL
) RETURNS jsonb
-- { "series_count": N, "reception_id": "...", "guide_number": "..." }
```

---

## 4. Rutas UI / APIs

| Ruta | Cambio visible |
|------|----------------|
| `/logistica/devoluciones` (devolver lote) | Ninguno |

---

## 5. Compatibilidad hacia atrás

- [x] Mismo formato de notas en series y recepción
- [x] No actualiza OS ni SAP doc (igual que legacy)
- [x] Rollback: flag off

**Breaking changes:** ninguno con flag `false`.

---

## 6. Feature flag

| Flag | Default | Descripción |
|------|---------|-------------|
| `USE_ATOMIC_FULL_RECEPTION_RETURN` | `false` | RPC vs Promise.all legacy |

**Env:** `NEXT_PUBLIC_USE_ATOMIC_FULL_RECEPTION_RETURN` o `NEXT_PUBLIC_FEATURE_FLAGS`.

---

## 7. Plan de rollback

1. `USE_ATOMIC_FULL_RECEPTION_RETURN=false`
2. Probar devolución lote en staging
3. Emergencia: `DROP FUNCTION full_reception_return_tx`

---

## 8. Riesgo operativo

☑ **Medio** — paridad obligatoria antes de activar flag en prod.

---

## 9. Pruebas de paridad

- [ ] Devolución lote con N series desde Devoluciones
- [ ] Reception → `DEVUELTO`, todas series `returned`
- [ ] Notas series con prefijo `--- DEVOLUCIÓN ---`
- [ ] Audit `DEVOLUCION_LOTE` + N × `DEVOLUCION_EQUIPO`
- [ ] Flag off vs on mismo lote (staging)

---

## 13. Entregables

| # | Archivo |
|---|---------|
| 1 | `supabase/migrations/031_full_reception_return_tx.sql` |
| 2 | `processFullReceptionReturn` en `returns.ts` |
| 3 | Flag `USE_ATOMIC_FULL_RECEPTION_RETURN` |

---

## Referencias

- [CHG-004](CHG-004-block-return-rpc.md)
- [roadmap-phases.md](../architecture/roadmap-phases.md) § Fase 1

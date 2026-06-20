# returns — Notas de migración

**Versión:** 1.0

---

## 1. Baseline

| Item | Estado |
|------|--------|
| `returns.ts` | Monolito lib |
| Block return en `sapTransfers.ts` | Acoplamiento cruzado |
| TX atómica bloque | Parcial (chunks, no TX DB) |
| TX lote completo | No — Promise.all |
| `series.notes` | Migration 028 aplicada |

---

## 2. CHG planeados

### CHG-004: RPC block_return_by_sap_transfer_tx

| Campo | Valor |
|-------|-------|
| **Reglas** | R-RN-30 a R-RN-35, R-031 |
| **Co-dueño** | sap-transfer |
| **Flag** | `USE_ATOMIC_BLOCK_RETURN` |
| **Migración** | `030_block_return_by_sap_transfer_tx.sql` |
| **Estado** | Implementado — flag off por default |
| **Riesgo** | Medio |
| **Fase** | 1 |
| **Doc** | [CHG-004](../../changes/CHG-004-block-return-rpc.md) |

### CHG-005: RPC full_reception_return_tx

| Campo | Valor |
|-------|-------|
| **Reglas** | R-RN-20 a R-RN-24, R-031 |
| **Flag** | `USE_ATOMIC_FULL_RECEPTION_RETURN` |
| **Migración** | `031_full_reception_return_tx.sql` |
| **Estado** | Implementado — flag off por default |
| **Doc** | [CHG-005](../../changes/CHG-005-full-reception-return-rpc.md) |
| **Riesgo** | Medio |
| **Fase** | 1 |

### CHG-006: Desacoplar returns ← sapTransfers

| Acción | Puerto `SapTransferReturnPort` en sap-transfer |
| **Fase** | 2 |

### CHG-007: Individual return update OS

| Gap | Marcar OS DEVUELTO en individual si aplica |
| **Fase** | 2 — requiere regla negocio operaciones |

---

## 3. Orden ejecución

```
1. ~~CHG-004 block return RPC~~ ✓
2. ~~CHG-005 full reception return RPC~~ ✓
3. Aplicar 030 + 031 en Supabase + paridad staging
4. Activar flags atómicos (fuera de pico)
5. CHG-006 desacoplar SapTransferReturnPort
6. CHG-003 extracción módulo sap-transfer
7. CHG-007 OS individual (si aprobado)
```

---

## 4. Operación continua

| Cambio | Estrategia |
|--------|------------|
| Nueva RPC | Wrapper legacy llama RPC si flag true |
| Rollback | Flag false |
| Backfill notes | No requerido post 028 |

---

## 5. Checklist pre-código returns

- [x] Spec returns completa
- [x] Spec sap-transfer completa
- [x] Integration doc
- [x] CHG-004 impacto aprobado — [CHG-004](../../changes/CHG-004-block-return-rpc.md)
- [ ] Roles RLS validados en staging
- [ ] Caso PRUEBAS-06 en checklist paridad

---

## Referencias

- `../sap-transfer/migration-notes.md` CHG-001
- `../../architecture/impact-change-template.md`

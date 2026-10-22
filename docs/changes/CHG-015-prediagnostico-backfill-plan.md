# CHG-015 — Backfill pre-diagnóstico stock histórico (plan de implementación)

| Campo | Valor |
|-------|-------|
| **Estado** | Fases 1–4 en código; Fase 5 = ejecución ops (staging/prod) con panel admin + `runAll` API |
| **Spec código** | `web/src/modules/backoffice/prediagnostico/prediagnosticoBackfillPlan.ts` |
| **Tests** | `prediagnosticoBackfillPlan.test.ts`, `validatePrediagnostico.test.ts` |
| **Tablas** | `prediagnosticos`, `prediagnostico_revisiones`, `cat_prediagnostico_*`, `service_orders`, `series` |
| **Relacionado** | CHG CAC pre-diagnóstico (251), PX (254), irreparable + notas obligatorias |

> **For agentic workers:** Implementar tarea por tarea; marcar checkboxes. No ejecutar backfill en producción sin dry-run firmado por operaciones.

**Goal:** Poblar `prediagnosticos` para todo el stock histórico elegible con datos sintéticos creíbles (carcasa, dictamen, defectos por modelo, fechas post-ingreso), excluyendo equipos que ingresen después del corte **T0** y sin sobrescribir pre-diagnósticos manuales.

**Architecture:** Política pura en TypeScript (ya escrita) + servicio de ejecución por lotes en Node (admin API o script) que resuelve catálogo igual que la UI, inserta vía `PrediagnosticoStore` con timestamps históricos. Opcional: columna `origen` en migración 255 para auditoría.

**Tech Stack:** Next.js App Router, Supabase Postgres, Vitest, módulo existente `prediagnosticoService` / `validatePrediagnostico`.

**Spec:** Este documento + `prediagnosticoBackfillPlan.ts`.

## Global Constraints

- TypeScript strict; sin `any`.
- Validación: `validatePrediagnostico` (incluye **irreparable → observaciones obligatorias**).
- Catálogo: solo IDs presentes en `filterPrediagnosticoCatalogForEquipment` + perfil modelo (`253`).
- Marca sintética en observaciones: prefijo **`[BACKFILL]`** (reportes pueden filtrar).
- Idempotente: **nunca** `UPDATE`/`INSERT` si ya existe fila en `prediagnosticos` para esa OS.
- Roles ejecución: `admin` / `supervisor` (API interna); no exponer a `receptor_*` en v1.

---

## 1. Política de negocio (revisada — SSOT en código)

### 1.1 Población

| Incluir | Excluir |
|---------|---------|
| OS con serie CPE en planta, sin fila en `prediagnosticos` | Accesorios, teléfonos, devoluciones |
| `service_orders.created_at < T0` (corte) | OS creadas **≥ T0** (pre-diag manual obligatorio) |
| Una OS = un pre-diagnóstico | OS ya con pre-diagnóstico manual |

**Fecha de ingreso (`ingressAt`):** preferir `service_orders.created_at`; fallback `series.created_at` o primera recepción documentada (definir en SQL una sola expresión `COALESCE` y documentarla en el servicio).

**Scrap / irreparable (Fase 1 — antes del 65/35):**

- `series.current_status IN ('irreparable', 'scrapped', 'in_scraps')` (validar lista final con taller).
- Dictamen: `irreparable`, clase **D**, cosméticos/funcionamiento en fallo, **observaciones** con motivo taller o `[BACKFILL]…`.

### 1.2 Dictamen (no scrap)

| Dictamen | % sobre resto |
|----------|----------------|
| `reacondicionado` (RC) | **54.1 %** |
| `reparado` (RP) | **45.9 %** |

Asignación determinística: `stableSlot(serial)` → slot 0..999.

### 1.3 Clase de carcasa (toda la población backfill)

| Clase | % |
|-------|---|
| **B** | 45 % |
| **C** | 25 % |
| **D** | 18 % |
| **A** | 11.5 % |

Suavizado con dictamen:

- Reacondicionado: evitar **D** (bajar a B/C leve).
- Reparado: evitar **A** puro / **D** crudo (A→B, D→C).
- Irreparable scrap: fuerza **D**.

### 1.4 Reparados — defectos (solo catálogo del modelo/tecnología)

Temas en `REPAIR_DEFECT_THEMES` (puertos oxidados, mecánicos, carcasa, antena, pines, RF, botones, etiqueta, WiFi, Ethernet). Por equipo **2–3 temas** que **matcheen nombre** de ítem en catálogo filtrado; si el modelo no tiene ítem RF (ONT), no se inventa.

**Pre-requisito operativo:** Configuración → Pre-Diagnóstico: ítems por tecnología + matriz por modelo (GPON vs EMTA vs IPTV).

### 1.5 Fechas `creado_en` / `actualizado_en`

| Bucket | % | Regla (días calendario post-`ingressAt`) |
|--------|---|------------------------------------------|
| Ventana normal | **80 %** | Día **3, 4 o 5** |
| Fuera de ventana | **20 %** | Día **6 … 30** (después del día 5) |

- Hora laboral pseudoaleatoria 8–17 h (semilla por serie).
- No superar `asOf` (fecha de ejecución del backfill).
- Equipos con ingreso reciente: fechas recortadas a `asOf` (edge case documentado).

### 1.6 Post **T0**

- Flujos PX/CAC exigen pre-diagnóstico **real** (formulario).
- Backfill **no** selecciona `created_at >= T0`.
- UI: pendiente solo si no hay prediag **y** OS ≥ T0 (cambio UI opcional fase 4).

---

## 2. Mapa de archivos (implementación)

| Acción | Ruta |
|--------|------|
| **Ya existe** | `prediagnosticoBackfillPlan.ts`, tests |
| **Ya existe** | `validatePrediagnostico.ts` (+ irreparable notas) |
| **Crear** | `prediagnosticoBackfillService.ts` — orquestación, lotes, dry-run |
| **Crear** | `prediagnosticoBackfillEligibleQuery.ts` — tipos fila elegible |
| **Crear** | `web/src/app/api/v1/admin/prediagnostico/backfill/route.ts` — POST dry-run / apply |
| **Opcional** | `255_prediagnostico_origen.sql` — `origen text` + índice |
| **Crear** | `web/supabase/migrations/255_prediagnostico_backfill_audit.sql` (solo si se usa tabla audit) |
| **Doc** | Actualizar reporte prediagnóstico: filtro `NOT observaciones LIKE '[BACKFILL]%'` |
| **Tests** | `prediagnosticoBackfillService.test.ts` (mock store + catálogo fijo) |

---

## 3. Tareas de implementación

### Fase 0 — Preparación (operaciones + catálogo)

- [ ] **0.1** Acordar **`T0`** (timestamptz) y registrar en config env `PREDIAG_BACKFILL_CUTOFF` (solo server).
- [ ] **0.2** Checklist catálogo: GPON, EMTA, IPTV — ítems mínimos (puertos, carcasa, antena, RF si aplica, botones, WiFi, Ethernet).
- [ ] **0.3** Completar `cat_prediagnostico_model_items` para modelos con volumen > N unidades (priorizar top 20 modelos).
- [ ] **0.4** Confirmar lista estatus scrap con taller (`irreparable`, `scrapped`, `in_scraps`, …).

### Fase 1 — Servicio de elegibilidad y dry-run

- [x] **1.1** RPC `list_prediagnostico_backfill_candidates` → `255_prediagnostico_backfill_candidates.sql`
- [x] **1.2** `prediagnosticoBackfillEligibleQuery.ts`
- [x] **1.3** `prediagnosticoBackfillService.ts` + `prediagnosticoBackfillCatalog.ts` (dry-run + apply)
- [x] **1.4** Tests (`prediagnosticoBackfillService.test.ts`, plan tests)

### Fase 2 — Persistencia con timestamps históricos

- [x] **2.1** `insertPrediagnosticoBackfill(..., recordedAt)`
- [x] **2.2** Actor `Sistema · backfill CHG-015`
- [x] **2.3** Lotes vía `runPrediagnosticoBackfillBatch` (máx. 500)
- [x] **2.4** `runAll` + `maxBatches` en POST backfill (pagina hasta agotar candidatos)
- [x] **2.5** Test insert skip si ya existe

### Fase 3 — API admin y seguridad

- [x] **3.1** `POST /api/v1/backoffice/prediagnostico/backfill`
- [x] **3.2** Roles admin / supervisor
- [x] **3.3** Respuesta con `aggregates`, `rates`, `samples` (10)
- [x] **3.4** Header `X-Backfill-Confirm: CHG-015` o `confirmApply: true`

### Fase 4 — UI y reportes (opcional v1.1)

- [x] **4.1** Badge “Migración” (`PrediagnosticoMigrationBadge` en historial CAC).
- [x] **4.2** Checkbox “Excluir migración” en **Motor → Equipos prediagnosticados** (`excludeBackfill`).
- [x] **4.3** Bandeja pre-diag: `isOperatorPrediagnosticoPending` + `GET …/backfill/context` (T0).

### Fase 5 — Ejecución en producción

- [ ] **5.1** Staging: dry-run completo (`runAll: true` o panel CHG-015 — solo **admin/supervisor** en UI).
- [ ] **5.2** Staging: apply piloto (`limit: 100` + header confirm), validar Historial + badge Migración.
- [ ] **5.3** Prod: apply `runAll` + confirm en ventana de mantenimiento.
- [ ] **5.4** Post: `supabase/scripts/verify_prediagnostico_backfill.sql` (ajustar T0).

---

## 4. SQL de verificación (post backfill)

```sql
-- Sin prediag en elegibles pre-T0 (debe → 0)
SELECT count(*) AS pendientes
FROM service_orders so
LEFT JOIN prediagnosticos p ON p.service_order_id = so.id
WHERE p.id IS NULL
  AND so.created_at < :T0;

-- Mix dictamen (excluir manual si se desea)
SELECT dictamen, count(*), round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM prediagnosticos
WHERE observaciones LIKE '[BACKFILL]%'
GROUP BY 1;

-- Mix carcasa backfill
SELECT clase_carcasa, count(*)
FROM prediagnosticos
WHERE observaciones LIKE '[BACKFILL]%'
GROUP BY 1
ORDER BY 2 DESC;

-- Fechas: días calendario ingreso → prediag (muestra)
SELECT
  percentile_cont(0.5) WITHIN GROUP (ORDER BY (p.creado_en::date - so.created_at::date)) AS mediana_dias
FROM prediagnosticos p
JOIN service_orders so ON so.id = p.service_order_id
WHERE p.observaciones LIKE '[BACKFILL]%';
```

---

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Modelo sin ítems en catálogo | Skip + reporte; no insertar payload vacío inválido |
| Ingreso reciente + fechas clamp | Aceptable en backfill; % 80/20 se mide en stock con ingreso > 30 días |
| Confundir backfill con manual | Prefijo `[BACKFILL]` + opcional columna `origen` |
| Duplicar OS | UNIQUE `service_order_id` + check previo insert |
| PX post-T0 | No tocar `px_equipment_prediagnosticos` en backfill masivo OS |

---

## 6. Criterios de aceptación (DoD)

1. Dry-run en staging muestra ~**65/35**, carcasa **11.5/45/25/18**, fechas **80/20** (±2 % en N > 5000).
2. Reparados tienen ≥1 cosmético `danado` cuando el catálogo del modelo incluye ítems match.
3. Irreparables scrap tienen observaciones no vacías.
4. Cero filas backfill con `created_at >= T0`.
5. Re-ejecutar apply no duplica ni actualiza registros existentes.
6. Historial CAC muestra dictamen/clase coherente con taller.

---

## 7. Orden de commits sugerido

1. `feat(prediagnostico): servicio backfill dry-run + tests`
2. `feat(prediagnostico): save con recordedAt histórico`
3. `feat(admin): API backfill prediagnóstico`
4. `docs: CHG-015 plan` (este archivo)
5. (Opcional) `db: 255 origen prediagnostico`
6. (Post-prod) `feat(reportes): excluir backfill`

---

## 8. Pendiente de decisión (Product Owner)

| # | Pregunta | Default propuesto |
|---|----------|-------------------|
| 1 | Valor exacto **T0** | Fecha/hora del deploy CHG-015 apply |
| 2 | 65/35 **global** vs **por modelo** | Por modelo (top modelos) |
| 3 | Ventana tardía 20 %: ¿máx +30 días o +15? | +30 (código actual) |
| 4 | Columna `origen` en DB | Sí en 255 (`manual` / `backfill`) |
| 5 | ¿Backfill equipos solo en bodega o todo WIP? | Todo OS elegible sin prediag pre-T0 |

---

## 9. Referencia API (implementada)

**Env server:** `PREDIAG_BACKFILL_CUTOFF=2026-03-14T00:00:00-06:00` (T0) — o enviar `cutoff` en el body.

```http
POST /api/v1/backoffice/prediagnostico/backfill
Content-Type: application/json
X-Backfill-Confirm: CHG-015   # solo apply

{ "dryRun": true, "limit": 500, "offset": 0 }

# Dry-run completo (todos los lotes, máx. 500 lotes × 500 filas)
{ "dryRun": true, "runAll": true, "maxBatches": 500 }

# Apply producción (requiere confirm)
{ "dryRun": false, "runAll": true, "confirmApply": true }
```

**Contexto UI (T0):** `GET /api/v1/backoffice/prediagnostico/backfill/context` → `{ cutoff, configured, canRunBackfill }` (panel ops solo si `canRunBackfill`).

Respuesta dry-run esperada:

```json
{
  "eligible": 12450,
  "wouldInsert": 12450,
  "skippedExisting": 0,
  "skippedNoCatalog": 12,
  "aggregates": {
    "verdict": { "reacondicionado": 0.65, "reparado": 0.35, "irreparable": 0.08 },
    "shell": { "A": 0.115, "B": 0.45, "C": 0.25, "D": 0.18 },
    "timing": { "within_3_5_days": 0.8, "after_5_days": 0.2 }
  }
}
```

*(Porcentaje irreparable depende del stock scrap real, no es fijo.)*

---

## 10. Código ya mergeado / local (no desplegado aún)

- Política: `prediagnosticoBackfillPlan.ts` + tests.
- Validación irreparable + UI observaciones obligatorias (`validatePrediagnostico`, paneles CAC/PX).

Siguiente paso operativo: **Fase 5** (staging dry-run → piloto → prod) tras migración **255** + T0 en env.

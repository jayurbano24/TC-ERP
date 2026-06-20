# ADR-001 — Evolución hacia Monolito Modular

| Campo | Valor |
|-------|-------|
| **Estado** | Aprobado para planificación |
| **Fecha** | 2026-06-18 |
| **Decisión** | Evolucionar TC-ERP como monolito modular antes de microservicios |
| **Alcance** | Flujo CAC: recepción → backoffice → bodega → taller → despacho → devoluciones |

---

## Contexto

TC-ERP es una aplicación **Next.js + Supabase/PostgreSQL** que gestiona trazabilidad serial de equipos de telecomunicaciones. El dominio operativo central es:

```
Reception (lote) → ReceptionGuide (guía courier) → SapTransferDocument → ServiceOrder (TC-XXX) → Series (S1–S4)
```

El sistema funciona en producción, pero presenta deuda estructural:

- Lógica de negocio en páginas de 2.000–4.500 líneas.
- Estados en strings dispersos (enum PostgreSQL vs runtime).
- Metadata crítica en `receptions.notes` con parsing frágil.
- Operaciones multi-tabla sin transacciones atómicas.
- RLS compensada con RPC `SECURITY DEFINER`.

**Restricción no negociable:** La operación diaria (recepción, clasificación, bodega) **no puede detenerse** durante la refactorización.

---

## Decisión

### 1. Arquitectura objetivo inmediata: **Monolito Modular + Hexagonal**

Un solo deploy (Next.js + Supabase), organizado en **bounded contexts** con **Arquitectura Hexagonal** (ADR-004):

```
Driving adapters (UI, API) → Application (use cases) → Domain (ports) ← Infrastructure (adapters)
```

Ver detalle: [`ADR-004-hexagonal-architecture.md`](ADR-004-hexagonal-architecture.md), [`hexagonal-layout.md`](hexagonal-layout.md).

### 2. Microservicios: **solo en Fase 4 (opcional)**

Extraer servicios únicamente cuando existan:

- Contratos de eventos estables.
- Transacciones atómicas en PostgreSQL (RPC).
- Límites de dominio claros y bajo acoplamiento.

Candidatos futuros: `sap-integration`, `traceability/reporting`, `platform/audit`.

**No extraer pronto:** `production-classification`, `warehouse`, `workshop` (alta interdependencia transaccional).

### 3. Estrategia de migración: **Strangler Fig**

- Envolver código legacy; no reescribir de golpe.
- Feature flags por módulo.
- Dual-write / dual-read al migrar off `notes`.
- Rollback por módulo sin afectar operación.

---

## Alternativas consideradas

| Alternativa | Descartada porque |
|-------------|-------------------|
| Big-bang rewrite | Detiene operación semanas; alto riesgo |
| Microservicios inmediatos | Multiplica inconsistencias sin dominio consolidado |
| Solo refactor UI | No resuelve huérfanos, estados ni atomicidad |
| Mantener status quo | Deuda crece; errores operativos recurrentes |

---

## Consecuencias

### Positivas

- Operación continua durante toda la evolución.
- Reglas de negocio en un solo lugar (`domain/`).
- Archivos ≤ 300 líneas (salvo contenedores justificados).
- Documentación técnica por módulo antes de código.
- Base sólida para extracción futura a microservicios.

### Negativas / costos

- Período de coexistencia legacy + modular (6–12 meses).
- Esfuerzo de documentación y paridad funcional.
- Migración de datos históricos en `notes` (backfill nocturno).

---

## Fases de implementación

| Fase | Duración | Entregable clave | Impacto operativo |
|------|----------|-----------------|-------------------|
| **0** | 2–3 sem | Gobierno, glosario, catálogo estados | Ninguno |
| **1** | 4–6 sem | RPCs atómicas (classify, block return) | Bajo |
| **2** | 6–10 sem | Módulos internos + split UI | Ninguno (mismas rutas) |
| **3** | 8–12 sem | Dual-write timeline; backfill | Ninguno (ventanas nocturnas) |
| **4** | 3–6 mes | Microservicios opcionales | Medio (solo módulos extraídos) |

**Plan detallado:** [`roadmap-phases.md`](roadmap-phases.md) — entregables, CHGs, tracks, métricas y cronograma.

---

## Módulo piloto (Fase 1–2)

**Primeros módulos a formalizar:**

1. `sap-transfer` — Documentos SAP, agrupación, clasificación batch.
2. `returns` — Devolución individual, lote y bloque por SAP.

Justificación: reglas acotadas, tablas ya formalizadas (024–028), acoplamiento explícito vía `sap_transfer_id`.

Documentación: `docs/modules/sap-transfer/`, `docs/modules/returns/`.

---

## Reglas de gobierno (obligatorias)

1. No generar código sin arquitectura + impacto documentados.
2. Archivos ≤ 300 líneas sin justificación en ADR o README del módulo.
3. SOLID: un caso de uso = una responsabilidad.
4. Sin duplicación de reglas (solo en `domain/`).
5. Respetar rutas URL y tablas existentes durante strangler.
6. Nomenclatura según `docs/architecture/glossary.md`.
7. Plantilla de impacto: `docs/architecture/impact-change-template.md`.
8. Arquitectura hexagonal obligatoria: `docs/architecture/ADR-004-hexagonal-architecture.md`.

---

## Métricas de éxito

| Métrica | Baseline | Objetivo Fase 2 |
|---------|----------|-----------------|
| Ingresos huérfanos (OS sin series) | > 0 casos | 0 en flujo nuevo |
| Pantallas “vacías” por fetch fallido | Recurrente | Banner + retry automático |
| Líneas en `backoffice/page.tsx` | ~4.400 | < 300 (contenedor) + submódulos |
| Reglas duplicadas courier/agency | 5+ archivos | 1 (`cacAgencyUtils` → domain) |
| Devolución bloque inconsistente | Posible | 100% transaccional (RPC) |

---

## Referencias

- Ingeniería inversa: conversación arquitectura 2026-06-18
- Schema: `supabase/migrations/024` – `028`
- Código actual: `src/lib/database/sapTransfers.ts`, `returns.ts`
- Glosario: `glossary.md`
- Catálogo estados: `entity-status-catalog.md`

---

## Aprobaciones

| Rol | Nombre | Fecha | Firma |
|-----|--------|-------|-------|
| Product Owner | | | |
| Tech Lead | | | |
| Operaciones CAC | | | |

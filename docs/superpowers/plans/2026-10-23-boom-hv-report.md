# Boom HV Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar la operación de harvesting de su reporte y crear la pestaña Boom HV con marca, modelo, tecnología y cada pieza retirada.

**Architecture:** La consulta existente de sesiones se enriquecerá desde la serie donante hacia modelo, marca y tecnología. Harvesting conservará únicamente captura; un componente Boom HV consumirá el historial enriquecido, lo aplanará a una fila por pieza y permitirá exportarlo a CSV.

**Tech Stack:** Next.js, React, TanStack Query, TypeScript, Supabase/PostgREST, Vitest.

**Spec:** Solicitud del usuario del 2026-10-23 en esta conversación.

## Global Constraints

- No duplicar registros: Boom HV usa `part_harvest_sessions` y `part_harvest_lines` existentes.
- Una fila del reporte representa una pieza retirada de una serie donante.
- Harvesting deja de renderizar historial y trazas.
- Boom HV muestra al menos marca, modelo, tecnología, SKU, pieza y cantidad.

---

### Task 1: Modelo del reporte Boom HV

**Files:**
- Modify: `src/modules/parts/domain/harvestReport.ts`
- Modify: `src/modules/parts/domain/harvestReport.test.ts`

**Interfaces:**
- Consumes: sesiones enriquecidas devueltas por `fetchHarvestHistory`.
- Produces: `flattenBoomHvRows(rows)` y CSV con datos técnicos.

- [ ] **Step 1: Write the failing test** para una fila con marca, modelo, tecnología y pieza.
- [ ] **Step 2: Run test to verify it fails** con `npx vitest run src/modules/parts/domain/harvestReport.test.ts`.
- [ ] **Step 3: Write minimal implementation** que aplane una sesión a una fila por línea.
- [ ] **Step 4: Run test to verify it passes** con el mismo comando.

### Task 2: Enriquecer la consulta del historial

**Files:**
- Modify: `src/modules/parts/server/partsHarvestService.ts`

**Interfaces:**
- Consumes: relación `series -> brands/models -> technologies`.
- Produces: sesiones con `brand_name`, `model_name` y `technology_name`.

- [ ] **Step 1: Extend the select** de `listPartHarvestSessions` sin crear tablas nuevas.
- [ ] **Step 2: Verify the query** contra Supabase con una lectura real limitada.

### Task 3: Crear pestaña Boom HV y simplificar Harvesting

**Files:**
- Create: `src/app/(erp)/bodega/partes/_components/PartsBoomHvTab.tsx`
- Modify: `src/app/(erp)/bodega/partes/_components/PartsHarvestingTab.tsx`
- Modify: `src/app/(erp)/bodega/partes/page.tsx`

**Interfaces:**
- Consumes: `fetchHarvestHistory`, `flattenBoomHvRows`, `buildHarvestReportCsv`.
- Produces: pestaña `boom_hv` con tabla y descarga CSV.

- [ ] **Step 1: Remove history UI** y su estado/consultas desde Harvesting.
- [ ] **Step 2: Add Boom HV tab** a `TabId`, `TABS` y renderizado.
- [ ] **Step 3: Build report table** con caso, fecha, OS, serie, marca, modelo, tecnología, SKU, pieza y cantidad.
- [ ] **Step 4: Verify** pruebas del módulo, lint relevante, TypeScript focalizado y `git diff --check`.

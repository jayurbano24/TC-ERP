# Multi-Donor Harvesting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir Harvesting en un flujo por casos con varias series Scrap donantes, trazabilidad por pieza y reporte CSV.

**Architecture:** Se conservarÃ¡ `part_harvest_sessions` como registro por donante para no romper el historial y se agregarÃ¡ `case_id` como agrupador estable. La API aceptarÃ¡ varios donantes, validarÃ¡ que cada uno siga elegible y crearÃ¡ una sesiÃ³n trazable por donante; la UI manejarÃ¡ una cesta de donantes y lÃ­neas asociadas.

**Tech Stack:** Next.js, React, TypeScript, Zod, TanStack Query, Supabase/PostgreSQL, Vitest.

**Spec:** `CONTEXT.md`

## Global Constraints

- Solo series con estado `irreparable`/`scrapped` o ubicaciÃ³n SCRAP pueden donar.
- Toda lÃ­nea recuperada pertenece a exactamente una serie donante.
- Todo ingreso incrementa `qty_recovered_on_hand` mediante movimiento `IN_HARVEST`.
- Las tablas pÃºblicas permanecen con RLS y sin acceso directo de `anon`/`authenticated`.

---

### Task 1: Contrato multi-donante

**Files:**
- Create: `src/modules/parts/domain/harvestCase.ts`
- Test: `src/modules/parts/domain/harvestCase.test.ts`

**Interfaces:**
- Produces: `validateHarvestCaseInput(donors)` que rechaza donantes vacÃ­os, repetidos y lÃ­neas sin cantidad.

- [ ] Escribir pruebas fallidas para un caso vÃ¡lido, donante repetido y donante sin piezas.
- [ ] Ejecutar Vitest y comprobar RED.
- [ ] Implementar el validador puro.
- [ ] Ejecutar Vitest y comprobar GREEN.

### Task 2: Persistencia y API

**Files:**
- Create: `supabase/migrations/*_part_harvest_cases.sql`
- Modify: `src/modules/parts/server/partsHarvestService.ts`
- Modify: `src/app/api/v1/parts/harvest/route.ts`
- Modify: `src/lib/api/parts.ts`

**Interfaces:**
- Consumes: `validateHarvestCaseInput`.
- Produces: `createPartHarvestCase({ donors, sessionNotes, userId, userName })` y respuesta `{ caseId, donorCount, lineCount }`.

- [ ] Crear prueba de contrato de migraciÃ³n que exija `case_id` e Ã­ndice.
- [ ] Generar la migraciÃ³n con Supabase CLI.
- [ ] Agregar `case_id` con valor por defecto y backfill para historial.
- [ ] Adaptar Zod y el servicio para varios donantes sin romper el payload legado.
- [ ] Verificar tests y nombres de migraciÃ³n.

### Task 3: Interfaz por caso

**Files:**
- Modify: `src/app/(erp)/bodega/partes/_components/PartsHarvestingTab.tsx`

**Interfaces:**
- Consumes: `createPartHarvestApi({ donors, sessionNotes })`.
- Produces: selecciÃ³n mÃºltiple, donante activo y lÃ­neas visibles por donante.

- [ ] Agregar donantes a una cesta sin duplicados.
- [ ] Asociar cada nueva lÃ­nea al donante activo.
- [ ] Mostrar resumen por serie antes de registrar.
- [ ] Bloquear envÃ­o cuando una serie no tiene piezas.

### Task 4: Reporte y verificaciÃ³n

**Files:**
- Modify: `src/app/(erp)/bodega/partes/_components/PartsHarvestingTab.tsx`
- Test: `src/modules/parts/domain/harvestReport.test.ts`
- Create: `src/modules/parts/domain/harvestReport.ts`

**Interfaces:**
- Produces: `buildHarvestReportCsv(rows)` con una fila por pieza y serie donante.

- [ ] Escribir y ejecutar la prueba RED del CSV.
- [ ] Implementar escape CSV y columnas operativas.
- [ ] Agregar botÃ³n Descargar reporte.
- [ ] Ejecutar pruebas de parts, lint focalizado y verificaciÃ³n de migraciones.

# Parts Multi-Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un único SKU seleccione varias marcas y varios modelos dependientes sin duplicar inventario.

**Architecture:** `parts_catalog` conserva identidad, costo e inventario; `part_catalog_models` es la relación N:N autoritativa de compatibilidad. El servicio sincroniza esa relación al guardar y devuelve modelos/marcas compatibles; la UI edita listas de IDs mediante controles múltiples accesibles.

**Tech Stack:** Next.js 16, React 19, TypeScript, TanStack Query, Supabase/Postgres, Vitest/Testing Library.

**Spec:** Solicitud del usuario del 2026-10-22 en esta conversación.

## Global Constraints

- Un SKU y una sola existencia física, aunque tenga muchas compatibilidades.
- Los modelos seleccionables pertenecen únicamente a las marcas seleccionadas.
- La compatibilidad existente `brand_id`/`model_id` debe seguir funcionando durante la transición.
- No instalar dependencias nuevas.

---

### Task 1: Contrato de compatibilidad N:N

**Files:**
- Modify: `src/modules/parts/server/partsService.ts`
- Test: `src/modules/parts/server/partsCompatibility.test.ts`

**Interfaces:**
- Consumes: `part_catalog_models(catalog_id, model_id)` existente.
- Produces: `model_ids: string[]`, `brand_ids: string[]` en lectura y escritura del catálogo.

- [ ] Escribir pruebas que demuestren filtrado por múltiples marcas, deduplicación y sincronización de modelos.
- [ ] Ejecutarlas y comprobar que fallen por ausencia del contrato múltiple.
- [ ] Implementar la sincronización mínima, manteniendo el primer modelo como compatibilidad legacy.
- [ ] Ejecutar las pruebas hasta verde.

### Task 2: Validación HTTP

**Files:**
- Modify: `src/app/api/v1/parts/catalog/route.ts`
- Test: `src/app/api/v1/parts/catalog/route.test.ts`

**Interfaces:**
- Consumes: `brand_ids` y `model_ids` del formulario.
- Produces: entrada validada y sin IDs duplicados.

- [ ] Escribir una prueba de POST con varias marcas/modelos.
- [ ] Verificar el fallo actual de validación.
- [ ] Extender el esquema Zod con arreglos UUID acotados.
- [ ] Verificar respuesta y compatibilidad legacy.

### Task 3: Selector múltiple dependiente

**Files:**
- Modify: `src/app/(erp)/configuracion/components/PiezasCatalogView.tsx`
- Modify: `src/app/(erp)/configuracion/components/PiezasCatalogView.test.tsx`

**Interfaces:**
- Consumes: catálogos de marcas/modelos y `brand_ids`/`model_ids` de cada pieza.
- Produces: payload múltiple y controles con etiquetas accesibles.

- [ ] Escribir prueba: seleccionar dos marcas muestra modelos de ambas.
- [ ] Verificar que falle con los selectores simples actuales.
- [ ] Implementar selección múltiple de marcas con chips y eliminación.
- [ ] Implementar selección múltiple de modelos filtrados por marcas, quitando modelos inválidos al retirar una marca.
- [ ] Verificar creación, edición y payload.

### Task 4: Regresión integrada

**Files:**
- Test: archivos anteriores.

**Interfaces:**
- Consumes: flujo completo catálogo → modal → API → servicio.
- Produces: evidencia automatizada del comportamiento solicitado.

- [ ] Ejecutar pruebas focalizadas.
- [ ] Ejecutar ESLint de archivos tocados y `git diff --check`.
- [ ] Documentar cualquier fallo global preexistente sin mezclar correcciones ajenas.

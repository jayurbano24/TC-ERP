# Exportar reporte de pre-diagnóstico (PREDIAGNOSTICO_EQUIPOS)

## Solución recomendada — Excel en tu PC (sin depender del navegador)

1. Abre PowerShell en la carpeta del proyecto web:

   ```powershell
   cd c:\Users\Usuario01\TC-ERP\web
   ```

2. Verifica que `.env.local` tenga **SUPABASE_SERVICE_ROLE_KEY** y **NEXT_PUBLIC_SUPABASE_URL** (las mismas 22 variables que usa el backfill).

3. Ejecuta (tarda **~8–15 minutos**, no cierres la ventana):

   ```powershell
   npm run export:prediagnostico
   ```

4. Al terminar verás la ruta completa del archivo, por ejemplo:

   `c:\Users\Usuario01\TC-ERP\web\dist\PREDIAGNOSTICO_EQUIPOS_todos.xlsx`

   Abre esa carpeta en el Explorador:

   ```powershell
   explorer.exe c:\Users\Usuario01\TC-ERP\web\dist
   ```

**Nota:** Si ya corriste el export antes, el Excel puede estar ahí (~60–70 MB, ~81 584 filas) sin volver a ejecutar el comando.

---

## Desde el ERP (Reportes)

Requisitos:

- `USE_CENTRAL_REPORTING=true` o `NEXT_PUBLIC_FEATURE_FLAGS=USE_CENTRAL_REPORTING` en `.env.local`
- `npm run dev` en ejecución
- Código actualizado (fix consultas `.in()` en lotes)

Pasos:

1. Ir a **Gestión → Reportes** o `/reportes?code=PREDIAGNOSTICO_EQUIPOS`
2. Reporte **Equipos prediagnosticados**
3. Marcar **«Todos los pre-diagnósticos (sin filtro de fechas)»**
4. **No** marcar «Excluir CHG-015» (dejaría el Excel vacío)
5. Formato Excel → **Descargar** y esperar **10–20 min** sin cerrar la pestaña

### Excel con encabezados pero filas vacías (OS, FE, S1…)

La definición del reporte en Supabase quedó con columnas viejas. Ejecuta la migración **`259_prediagnostico_report_contract_columns.sql`** en el SQL Editor (o despliega el código reciente, que fuerza las 13 columnas SCA al exportar).

Si el catálogo en pantalla aún muestra OS/FE/S1, aplica la migración 259 y recarga `/reportes`.

Si aparece «Activa USE_CENTRAL_REPORTING», agrega en `.env.local`:

```env
NEXT_PUBLIC_USE_CENTRAL_REPORTING=true
USE_CENTRAL_REPORTING=true
```

Reinicia `npm run dev`.

---

## Errores frecuentes

| Síntoma | Causa | Qué hacer |
|--------|--------|-----------|
| `fetch failed` | URL PostgREST demasiado larga (corregido) o Supabase caído | Usar `npm run export:prediagnostico`; reintentar si status.supabase.com falla |
| Excel vacío / plantilla | Proyecto o credencial distinta en `.env` | Mismo `.env.local` que backfill |
| «No hay datos» con solo fechas | Antes leía bandeja CAC; usar «Todos» o fechas tras el fix | Marcar «Todos los pre-diagnósticos» |
| «Excluir CHG-015» marcado | Todo el stock es backfill | Desmarcar esa casilla |

---

## Verificación en Supabase (solo lectura)

```sql
SELECT count(*) FROM public.prediagnosticos;
-- Esperado: ~81584 tras CHG-015
```

---

## Formato contractual SCA (columnas del Excel)

| Columna en Excel | Qué registra TC-ERP |
|------------------|---------------------|
| Número de ingreso al SCA | OS (`service_orders.os_label`, ej. TC-20891) |
| Procedencia | **Planta Externa** (PX), **Aliados Bodega Central Zona N** (CAC), etc. — canal de ingreso, no el nombre de agencia |
| Agencia, Central o Aliado de recuperación | `sap_transfer_documents.agency` → guía CAC → notas `Backoffice_Agency`; en PX sin agencia, **Zona N** de las notas |
| Marca / Modelo / SKU | `series.material` o última fila **G985** (`sap_validation_details`, coincidencia) |
| Número de traslado SAP | `sap_transfer_documents.sap_document_number` → recepción |
| Serie / MAC | S1 y MAC en S2–S4 |
| Tecnología / Vigencia | Modelo + catálogo Vigente/Obsoleto |
| Fecha de ingreso | `series.created_at` (recepción en bodega) |
| Dictamen + **columnas por ítem del catálogo** (`cat_prediagnostico_items`, orden `sort_order`) + Clase + Observaciones | Cada ítem = columna **Si/No**; si hay perfil en `cat_prediagnostico_model_items`, export masivo usa la **unión** por modelos presentes |

### Muestra de 100 casos (validación contrato)

```powershell
cd c:\Users\Usuario01\TC-ERP\web
npm run export:prediagnostico:sample100
```

Salida: `web\dist\PREDIAGNOSTICO_EQUIPOS_muestra_100.xlsx`

---

## Integración CI — `export-prediagnostico-all.test.ts`

Esta prueba **no** corre en la suite unitaria. Es integración contra Supabase (remoto o Docker aislado).

| Comando | Alcance |
|---------|---------|
| `npm run test:unit` / `npm test` | Vitest **excluye** `src/scripts/export-prediagnostico-all.test.ts` |
| `npm run test:integration:prediagnostico` | Solo el export (timeout 900 000 ms) |
| `npm run export:prediagnostico:test` | Alias del comando de integración |

### Precondiciones

1. `NEXT_PUBLIC_SUPABASE_URL` (o `SUPABASE_URL`)
2. `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`, **o** stack aislado:

   ```powershell
   npm run supabase:isolated:reset
   # apuntar .env.local al URL/keys del stack aislado
   ```

3. Opcional: `RUN_PREDIAG_EXPORT_INTEGRATION=1` — si faltan vars, la prueba **falla** en lugar de salir con aviso (útil en CI con secretos).

Sin URL/key: la prueba registra un warning y sale sin hang; no se considera “omitida del repo”, solo **condicionada** a backend disponible.

### CI recomendado

```yaml
unit:
  run: npm run test:unit
integration-prediagnostico:
  if: secrets.SUPABASE_SERVICE_ROLE_KEY
  env:
    RUN_PREDIAG_EXPORT_INTEGRATION: "1"
  run: npm run test:integration:prediagnostico
```

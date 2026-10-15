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

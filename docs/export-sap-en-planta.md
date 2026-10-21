# Export ETL — SAP En planta (~80k OS)

Para volúmenes grandes, **no uses la descarga del navegador** (timeout/memoria). Usa el script local con service role.

## Requisitos

- `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
- PowerShell en `web/`

## Comandos

```powershell
cd c:\Users\Usuario01\TC-ERP\web
npm run export:sap:en-planta
```

Genera **`web/dist/SAP_EN_PLANTA_YYYY-MM-DD.csv`** (recomendado).

Excel:

```powershell
npm run export:sap:en-planta:xlsx
```

## Columnas

OS, Marca, Modelo, Tecnologia, S1–S4 (SAP en S1), **Estatus SAP**, **Estatus operativo** (etiquetas *Inventario OS · Capacidad instalada*).

**Una fila por OS única** (~80k). Tabla dinámica sobre **Estatus operativo** para cuadrar buckets con el panel (conteo de OS, no de series).

## Abrir carpeta de salida

```powershell
explorer.exe c:\Users\Usuario01\TC-ERP\web\dist
```

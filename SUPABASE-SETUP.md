# Supabase Setup - TC-ERP Multimedia

Este proyecto ya esta preparado para detectar si Supabase fue configurado.

## Antes de crear la base
Puedes avanzar en:
- UI y navegacion.
- Formularios operativos.
- Modelo de datos.
- Roles y permisos a nivel de aplicacion.
- Flujos CAC, PX, series, bodega, taller y despacho.

## Cuando estes listo para conectar Supabase
1. Crear un proyecto en Supabase.
2. Copiar la URL publica del proyecto.
3. Copiar la anon key publica.
4. Crear un archivo `.env.local` en la carpeta `web` con:

```env
NEXT_PUBLIC_SUPABASE_PROJECT_REF=lyhswvbchbgxhimmivim
NEXT_PUBLIC_SUPABASE_URL=https://lyhswvbchbgxhimmivim.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

## Referencia conocida del proyecto
- Project ref: `lyhswvbchbgxhimmivim`
- URL derivada: `https://lyhswvbchbgxhimmivim.supabase.co`
- Aun falta: anon key publica para activar autenticacion e integracion real.

## Siguiente capa tecnica recomendada
1. Instalar cliente JS:

```bash
npm install @supabase/supabase-js
```

2. Crear cliente compartido en `src/lib/supabase/client.ts`.
3. Conectar login con `signInWithPassword`.
4. Ejecutar scripts SQL en este orden (Supabase SQL Editor):
- `supabase/001_initial_schema.sql`
- `supabase/002_seed_reference_data.sql`
- `supabase/003_validation_queries.sql`
- `supabase/004_bootstrap_admin_user.sql`

5. Conectar login con `signInWithPassword`.
6. Aplicar ajustes finales de RLS por modulo segun reglas de negocio.

## Archivos SQL incluidos
- `supabase/001_initial_schema.sql`
	- Tipos y tablas principales para recepcion, series, bodega, taller y despacho.
	- Restriccion para evitar ordenes abiertas duplicadas por serie.
	- Funcion base de roles (`app_has_role`) y politicas RLS iniciales.

- `supabase/002_seed_reference_data.sql`
	- Catalogos iniciales de marcas, cliente y agencias.
	- Sincronizacion opcional de perfiles desde `auth.users`.

- `supabase/003_validation_queries.sql`
	- Verificacion de tablas, politicas RLS, seeds y enums.

- `supabase/004_bootstrap_admin_user.sql`
	- Asigna el primer usuario admin/supervisor usando un email existente en `auth.users`.
	- Requiere editar `target_email` antes de ejecutar.

- `supabase/005_bootstrap_admin_by_user_id.sql`
	- Alternativa por `user_id` directo cuando la busqueda por email falla.
	- Requiere pegar un `auth.users.id` real antes de ejecutar.

## Estado actual de la app
- Si las variables no existen, el login entra en modo preparacion.
- Si existe `NEXT_PUBLIC_SUPABASE_PROJECT_REF`, la app puede derivar la URL del proyecto automaticamente.
- Si existe URL o project ref y tambien la anon key, la UI reconoce que Supabase ya esta listo para integrarse.

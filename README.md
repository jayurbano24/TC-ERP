# TC-ERP Multimedia Web

Base inicial de la aplicacion web para TC-ERP-Multimedia, construida con Next.js + TypeScript + Tailwind.

## Estado actual
- Pantalla inicial con branding Tech Corps.
- Mapa funcional de los 14 modulos del ERP.
- Roadmap de implementacion en 3 fases.
- Estructura lista para crecer por dominios.

## Ejecutar en local
1. Instala dependencias:

```bash
npm install
```

2. Inicia el servidor de desarrollo:

```bash
npm run dev
```

3. Abre en el navegador:

http://localhost:3000

## Estructura clave
- src/app/layout.tsx: metadata global y layout base.
- src/app/page.tsx: dashboard inicial de producto.
- src/app/globals.css: tokens visuales y estilos base.
- src/lib/modules.ts: catalogo funcional y fases.

## Siguiente objetivo sugerido
Implementar la Fase 1 (MVP Operativo) con estas capas:
- Autenticacion y roles (RBAC).
- Recepcion CAC y PX.
- Control de series y estados.
- Movimientos de bodega.
- Taller basico + QC.
- Despacho basico.

## Stack recomendado del proyecto
- Frontend: Next.js (App Router).
- Backend y BD: Supabase (PostgreSQL, auth, RLS, logs).
- Observabilidad: Sentry.
- Despliegue: Vercel.

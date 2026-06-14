# 0002 - Adopción de Prisma ORM y Patrón Repository

**Fecha**: 2026-06-13
**Estado**: Aceptado

## Contexto
El sistema interactúa con PostgreSQL utilizando el cliente de Supabase directamente desde el frontend y los hooks. Esto produce problemas de seguridad y fuga de responsabilidades, acoplando la interfaz de usuario con la infraestructura.

## Decisión
- **Prisma ORM** se convierte en el mecanismo exclusivo y oficial para el acceso a la base de datos de todo el ERP.
- Toda interacción será a través del **Repository Pattern** bajo la capa de Infraestructura, implementando contratos del Dominio (`IRepository`).
- Se introducen conceptos transversales universales en todas las tablas (`tenant_id`, `branch_id`, Soft Delete).

## Consecuencias
- **Positivas**: Tipado estático y predictibilidad en las consultas. Separación clara de responsabilidades impidiendo acceso directo a la DB desde componentes. Soporte robusto de transacciones asíncronas para el Outbox Pattern.
- **Negativas**: Necesidad de reescribir progresivamente todo el sistema de acceso a datos actual mediante el patrón Strangler Fig. Mantenimiento del esquema centralizado.

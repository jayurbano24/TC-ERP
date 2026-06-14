# 0001 - Adopción de Modular Monolith

**Fecha**: 2026-06-13
**Estado**: Aceptado

## Contexto
El ERP actual experimenta problemas de acoplamiento, alta complejidad en el frontend y dificultad para separar lógicas de negocio, lo cual restringe la agilidad del equipo y el crecimiento del software como SaaS multi-tenant.

## Decisión
Migrar a una arquitectura **Modular Monolith** basada en principios de *Domain-Driven Design* (DDD) y *Clean Architecture*. El sistema operará físicamente bajo un único repositorio y proceso, pero lógicamente particionado en módulos (Bounded Contexts) que no comparten bases de datos ni código interno de dominio.

## Consecuencias
- **Positivas**: Reducción drástica del acoplamiento. Autonomía de los módulos. Facilidad para transicionar a Microservicios en el futuro remoto si fuese necesario. Incremento en la mantenibilidad y seguridad del sistema corporativo.
- **Negativas**: Curva de aprendizaje inicial elevada para el equipo de desarrollo. Necesidad de infraestructura cruzada estricta (Event Bus, Inyección de Dependencias, Mappers).

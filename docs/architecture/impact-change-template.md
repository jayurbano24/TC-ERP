# Plantilla — Análisis de impacto de cambio

**Obligatoria antes de cualquier implementación.**  
Copiar este archivo por cambio: `docs/changes/CHG-XXX-descripcion.md`

---

## Metadatos

| Campo | Valor |
|-------|-------|
| **ID cambio** | CHG-XXX |
| **Título** | |
| **Módulo(s)** | |
| **Fase ADR-001** | 0 / 1 / 2 / 3 / 4 |
| **Capas hexagonal** | domain / application / infrastructure / interfaces |
| **Autor** | |
| **Fecha** | |
| **Estado** | Borrador / Revisión / Aprobado / Implementado |

---

## 1. Descripción

¿Qué se cambia y por qué? (2–4 oraciones)

---

## 2. Reglas de negocio afectadas

| ID regla | Descripción | ¿Cambia comportamiento? |
|----------|-------------|-------------------------|
| R-XXX | | Sí / No |

Referencia: `modules/*/business-rules.md`

---

## 3. Tablas y relaciones

| Tabla | Operación | Migración SQL |
|-------|-----------|---------------|
| | SELECT / INSERT / UPDATE / DELETE | Sí / No — archivo |

---

## 4. Rutas UI / APIs

| Ruta / endpoint | Cambio visible usuario |
|-----------------|------------------------|
| | |

---

## 5. Compatibilidad hacia atrás

- [ ] Datos legacy (`notes`) siguen legibles
- [ ] Estados legacy mapeados via alias
- [ ] Scripts reparación existentes siguen válidos
- [ ] Rollback documentado

**Breaking changes:** (listar o "ninguno")

---

## 6. Feature flag

| Flag | Default | Descripción |
|------|---------|-------------|
| `USE_XXX` | `false` | |

Sin flag → justificar por qué es seguro desplegar directo.

---

## 7. Plan de rollback

1. Paso 1
2. Paso 2
3. Verificación post-rollback

**Tiempo estimado rollback:** ___ minutos

---

## 8. Riesgo operativo

| Nivel | Criterio |
|-------|----------|
| ☐ Bajo | Solo refactor interno; misma UI |
| ☐ Medio | Cambio flujo; paridad testeada |
| ☐ Alto | Migración datos; ventana mantenimiento |

**Ventana despliegue recomendada:** horario laboral / fuera de horario / fin de semana

---

## 9. Pruebas de paridad requeridas

- [ ] Caso feliz CAC completo (recepción → clasificación → historial)
- [ ] Devolución individual (1 unidad SAP)
- [ ] Devolución en bloque SAP
- [ ] Reversión devolución → `PENDIENTE_BACKOFFICE`
- [ ] PX ingreso directo
- [ ] Ingreso bodega post-clasificación
- [ ] Regresión RLS / permisos rol backoffice

---

## 10. Documentación a actualizar

- [ ] README del módulo
- [ ] `business-rules.md`
- [ ] `state-machine.md`
- [ ] `migration-notes.md`
- [ ] Glosario (si nuevo término)

---

## 12. Cumplimiento hexagonal (ADR-004)

| Pregunta | Respuesta |
|----------|-----------|
| ¿Capa tocada? | domain / application / infrastructure / interfaces |
| ¿Nuevo port? | Nombre + ubicación `domain/ports/` |
| ¿Nuevo adaptador? | Qué port implementa |
| ¿Importa `lib/database` desde UI? | Sí / No — si sí, justificar Strangler |
| ¿Comunicación cross-módulo? | Port / Event / N/A |
| ¿Registro DI (`container.ts`)? | Sí / No |
| ¿Feature flag Strangler? | `USE_HEXAGONAL_*` o N/A |

**Checklist PR:** ver `hexagonal-layout.md` §9.

---

## 13. Aprobaciones

| Rol | Aprobado | Fecha |
|-----|----------|-------|
| Tech Lead | | |
| Operaciones | | |

# TC-ERP — Revisión UX / Consistencia Operativa

**Estado:** ESTÁNDARES DEFINIDOS (Fase G de implementación pendiente de aprobación).  
**Fecha:** 2026-10-29  
**Regla Cursor:** `.cursor/rules/tc-erp-operational-ux.mdc`  
**Principio:** El problema de UX en un ERP no es solo color o apariencia. La interfaz debe impedir errores humanos, explicar bloqueos y mostrar el resultado real de cada operación.

---

## 1. Estándares obligatorios

### 1.1 Acciones bloqueadas con explicación

| Requisito | Criterio de aceptación |
| :--- | :--- |
| Motivo visible | Si QC / etapa está bloqueada, el operador ve el **motivo específico** (no solo botón disabled). |
| Requisito pendiente | Se indica qué falta (diagnóstico, reparación de catálogo, piezas, rol, etc.). |
| Autoridad | UI refleja; API/RPC rechaza si se fuerza. |

**Ejemplo de aplicación (taller):**  
“No hay reparaciones válidas para el diagnóstico. Revise Configuración → Catálogo Taller.” ya existe en `OperationDrawer`; extender el mismo patrón a **todas** las acciones de etapa bloqueadas (incluyendo Reacondicionar / L3 / transferencias).

### 1.2 Operaciones con estado verificable

Estados UI obligatorios para transferencias bodega→taller, operate-batch y similares:

1. **Procesando** — spinner / disabled; anti doble clic.  
2. **Confirmada** — respuesta OK + (ideal) verificación de estado del recurso.  
3. **Fallida** — mensaje accionable.  
4. **Requiere conciliación** — éxito reportado pero inventario/estado inconsistente (patrón ya parcial en `ALREADY_DISPERSED` / stale stock).

**Timeout:** consultar resultado antes de reintentar; no reenviar a ciegas.

### 1.3 Historial operativo accesible

Por equipo (serie / OS), cuando haya datos:

- movimiento / acción,
- usuario,
- fecha,
- estado anterior → estado nuevo,
- observaciones.

Empty state si no hay evidencia. No inventar filas.

### 1.4 Componentes uniformes

Reutilizar `components/ui`, molecules, organisms, tokens del proyecto. Misma jerarquía visual entre Recepción, Prediagnóstico, Taller, QC, Bodega y Despacho. Sin rediseño B2C.

---

## 2. Mapa de pantallas (auditoría Fase G — pendiente de ejecución)

| Módulo | Acciones bloqueadas | Estado operación | Historial | Uniformidad |
| :--- | :---: | :---: | :---: | :---: |
| Recepción | Pendiente revisar | Pendiente | Pendiente | Pendiente |
| Prediagnóstico | Pendiente | Pendiente | Pendiente | Pendiente |
| Taller | Parcial (outcomes / repairs) | Parcial (toasts) | Parcial (auditoría backend) | Parcial |
| QC | Pendiente | Pendiente | Pendiente | Pendiente |
| Bodega | Pendiente (post Phase 0 API) | Parcial (stale check) | Parcial | Pendiente |
| Despacho | Pendiente | Pendiente | Pendiente | Pendiente |

---

## 3. Relación con Fase 0 / arquitectura

- Phase 0 centraliza transferencia vía API → habilita estados verificables uniformes en Bodega.  
- `workshop_operate_batch_tx` (Fase C, no iniciada) permitirá devolver motivos de rechazo estructurados para la UI.  
- No modificar visual branding salvo componentes reutilizables existentes.

---

## 4. Criterio de cierre Fase G (futuro)

- [ ] Toda acción crítica bloqueada muestra motivo + requisito.  
- [ ] Transferencias y operate-batch exponen Procesando / Confirmada / Fallida / Conciliación.  
- [ ] Timeout → consulta antes de retry.  
- [ ] Historial mínimo accesible por equipo donde exista `erp_audit_logs`.  
- [ ] Sin pantallas nuevas con estilos ad hoc.

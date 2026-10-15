# Prompt para Cursor — PC LAB-005 (sync certificador → Supabase)

Copia **todo el bloque** siguiente en un chat nuevo de Cursor en la computadora del laboratorio (repo del certificador / Nest / Electron / Go lab, **no** TC-ERP web).

---

## PROMPT (copiar desde aquí)

```
Contexto TECHCORP — estación LAB-005

El TC-ERP (Next.js) NO ejecuta certificaciones: solo lee la tabla Supabase `ont_runs` y reimprime el PDF desde `report_json`. LAB-002 envía payloads completos y el PDF sale bien. LAB-005 guarda JSON mínimo: PDF con 2 filas, SN vacío, EMTA/DOCSIS sin ds_rows (ej. run_id LAB-005-TC-0010, Hitron CG-2200).

Objetivo en ESTA PC (LAB-005):
1) Encontrar el código que hace INSERT/UPSERT a Supabase `ont_runs` (buscar: ont_runs, report_json, supabase, sync, station, LAB-005).
2) Comparar con la configuración/build de LAB-002 en la otra PC si hay docs o .env.example (station code, versión app, flags de sync).
3) Asegurar que cada corrida terminada envíe el MISMO contrato de datos que LAB-002 — no un stub.

Contrato mínimo `report_json` (fuente de verdad para PDF):

- Raíz:
  - run_id, station ("LAB-005"), global_verdict (PASS|FAIL), title
  - dut: { serial, mac, model, brand, firmware, hardware, … }
  - flows: [ { verdict, mbps_avg, jitter_ms, packet_loss_pct, kind, … } ]  (QOS / iPerf)
  - ports: [ … ]  (ONT con pruebas LAN)
  - certificate_sheet: { … }  ← OBLIGATORIO para PDF tipo lab

- Perfil ONT (GPON): certificate_sheet con
  - order, serial, long_date, approved, headline_cpe ("CERTIFICADO" / "NO CERTIFICADO")
  - cpe_rows: [ { section, name, read, expected, state } ]  (≥ 8 filas típicas: IDENTIFICACIÓN, WI-FI, QOS, ÓPTICA GPON)
  - physical_rows, optical_chart (si aplica)

- Perfil EMTA/DOCSIS (ej. Hitron CG-2200): certificate_sheet con
  - emta: true, order, serial, approved, headline, rows (misma forma section/name/read/expected/state)
  - dut.ds_rows, dut.us_rows (canales RF) y/o certificate_sheet.ds_rows / us_rows
  - rf_chart (opcional), flows de rendimiento

Columnas planas en `ont_runs` (además de report_json):
- serial, mac, model, device_type, kind, verdict, station, operator, recorded_at
- Rellenar serial SIEMPRE desde dut.serial (no dejar vacío si la prueba lo capturó)

Reglas de sync:
- Enviar report_json COMPLETO (no truncar por tamaño; no omitir certificate_sheet).
- No hacer segundo insert “vacío” del mismo run_id (causa duplicados; el ERP elige la fila más rica pero el stub ensucia historial).
- Preferir UPSERT por id estable o una sola fila por run_id + recorded_at de fin de prueba.
- station debe ser exactamente "LAB-005" (coherente con run_id LAB-005-TC-NNNN).

Tareas concretas:
A) Localizar función de sync y listar qué campos se envían hoy vs contrato arriba.
B) Si certificate_sheet se genera en otro módulo, enlazar la generación EMTA/ONT al payload de Supabase (mismo objeto que usa el PDF local del certificador en LAB-002).
C) Añadir validación pre-sync: si octet_length(JSON) < 3000 o falta certificate_sheet o serial vacío → log error visible + no marcar sync OK.
D) Documentar en README del lab: versión/build, variable STATION=LAB-005, checklist post-deploy.

Criterio de aceptación (validar tras un run de prueba):
En Supabase SQL Editor:
```sql
SELECT run_id, station, serial,
       octet_length(report_json::text) AS bytes,
       jsonb_array_length(COALESCE(report_json->'certificate_sheet'->'rows','[]'::jsonb)) AS emta_rows,
       jsonb_array_length(COALESCE(report_json->'certificate_sheet'->'cpe_rows','[]'::jsonb)) AS cpe_rows,
       coalesce(jsonb_array_length(report_json->'dut'->'ds_rows'),0) AS dut_ds
FROM ont_runs
WHERE run_id = '<JOB recién sincronizado>'
ORDER BY recorded_at DESC LIMIT 3;
```
PASS: bytes claramente mayor que un stub (~2 filas), serial no null, emta_rows o cpe_rows ≥ 5 (según perfil), ds_rows > 0 para EMTA con RF capturado.

Referencia ERP (solo lectura, otro repo): TC-ERP/web/docs/changes/CHG-017-ont-runs-dos-pcs-lab.md y script diagnose_ont_runs_lab_stations.sql.

Empieza explorando el repo, dime qué stack es (Nest/Electron/Go), dónde está el sync, y propón el diff mínimo para paridad con LAB-002.
```

---

## Prompts cortos de seguimiento

**Si ya encontraron el sync pero falta certificate_sheet:**

```
En el flujo post-certificación, el objeto que se usa para imprimir PDF local debe ser el mismo que se asigna a report_json.certificate_sheet antes del upsert a ont_runs. Busca generateCertificateSheet / buildReport / printReport y conecta ese output al sync Supabase. Perfil EMTA: rows + ds_rows/us_rows en dut o sheet.
```

**Si hay duplicados:**

```
Busca todos los insert a ont_runs. Debe haber un solo write por run_id al finalizar la prueba. Elimina o desactiva sync parcial al inicio (identify) que deja report_json casi vacío. Implementa upsert o delete previo del stub mismo run_id.
```

**Si serial llega vacío:**

```
Rastrea dut.serial desde identify/inventory hasta el payload Supabase. Asegura que la columna ont_runs.serial y report_json.dut.serial y certificate_sheet.serial se setean con el mismo valor antes del insert.
```

**Comparar con LAB-002 (en PC buena, otro chat):**

```
Exporta o copia el report_json de una corrida PASS reciente de LAB-002 (desde Supabase o log local). En LAB-005, diff estructural clave a clave contra lo que enviamos hoy e iguala el shape (certificate_sheet, flows, dut).
```

---

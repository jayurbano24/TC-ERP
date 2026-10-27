# CHG: Observaciones obligatorias en dictamen irreparable

Fecha: 2026-10-27

## Problema

Commit `23af06c` dejó `IRREPARABLE_NOTES_REQUIRED_MESSAGE` y tests en rojo sin la regla en `validatePrediagnostico`.

## Cambio

- `validatePrediagnostico`: si `verdict === 'irreparable'` y `notes` vacío/blanco → error con el mensaje canónico.
- `savePrediagnostico` hereda el rechazo vía `ValidationException` (sin cambio de firma).
- Suite: `test:unit` excluye export Excel; `test:integration:prediagnostico` lo ejecuta condicionado a Supabase.

## Pruebas

- RED → GREEN: `validatePrediagnostico.test.ts` / `prediagnosticoService.test.ts` (casos irreparable).
- UI ya marcaba `required` en `PrediagnosticoPanel`; ahora el servidor/dominio lo enforzan.

## No incluido (siguiente)

- Organización WIP (Taller / Devoluciones / migraciones 277–284).
- Worktree limpio + ensayo restauración anonimizada.

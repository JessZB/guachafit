# Feature: anulacion-cuotas-tests (PROMPT 01 RF-008 lote API, fase roja)

## Objetivo
Ejecutar exactamente `.opencode-prompts/01-anulacion-cuotas-tests.md`: escribir specs en rojo + reporte, sin tocar producción.

## Problema
Faltan tests de contratos de anulación de cuotas (RF-008) en API antes de implementar.

## Por qué
Fase roja TDD: confirmar que fallan por razón esperada (no existe función/ruta/columna o difiere comportamiento), no por sintaxis/montaje.

## Alcance autorizado
- Leer: `02_Requerimientos/RF/RF-008-maquina-estados-cuota-recordatorios.md` (sección Anulación 2026-10-12), `apps/api/src/**/finanzas.service.ts` (`revertirTransaccion`), specs `apps/api/test/bdd/rf007-reversion-pago-aprobado.spec.ts`, `rf007-reversion-concurrencia.e2e.spec.ts`, `rf006-saldo-favor.spec.ts`, schema Drizzle, rutas finanzas.
- Escribir (solo nuevos, sin editar existentes):
  - `apps/api/test/bdd/rf008-anulacion-cuota.spec.ts`
  - `apps/api/test/bdd/rf008-anulacion-cuota-concurrencia.e2e.spec.ts`
  - `apps/api/test/bdd/rf008-anulacion-cuota-efectos.spec.ts` (solo si se necesita)
  - `.opencode-prompts/reportes/01-anulacion-cuotas-tests.reporte.md`
- Prohibido: código producción (incl. `packages/shared`, `packages/database`), editar specs existentes, leer/escribir `.env`, commit, push, dependencias nuevas, tocar superficie ajena de Entrenamiento (`EntrenamientoPage*`, `ProgresoPage*`, `components/atleta/*`, `components/entrenador/CampoPesoPrescrito*`, `SelectorPlantillaAsignacion*`, `lib/entrada-numerica*`, `lib/sesion-estado*`, prompts `.opencode-prompts/3x-*`, `.claude/settings.json`, `Notas del 09-10-2026.md`).

## Restricciones
- Rama `main`, base `376bbdb` (verificado 2026-10-12).
- Cada spec nuevo por separado con `npx vitest run <ruta>` en `apps/api` (pwsh, sin comodines).
- E2E solo si `E2E_DATABASE_URL` disponible; si no, reportarlo sin inventar.
- No declarar nada no observado. BLOCKER con `archivo:línea` si contrato contradice código, sin "arreglarlo".

## Checklist
- [x] T1 (delegated direct): escribir specs RF-008 en rojo según contratos A–F + reporte en ruta indicada. Ruta: delegated direct. Trigger: writer trigger (2+ ficheros no triviales) + preparation trigger (lectura prepara escritura).
- [x] T2 (parent): verificación estructural + `git status --short` + síntesis al usuario.

## Criterios de aceptación
- Specs nuevos existen y fallan en ROJO por razón esperada (o se documenta ROJO otra razón / VERDE inesperado con evidencia).
- Reporte en `.opencode-prompts/reportes/01-anulacion-cuotas-tests.reporte.md` con resumen, archivos, tabla contrato→test (`archivo:línea`)→estado con mensaje real, no expresados, hallazgos con severidad, `git status --short` + confirmación no se tocó producción.
- `git status --short` no muestra producción ni specs existentes modificados por este lote.

## Checks aplicables
- `npx vitest run <ruta spec>` por cada spec nuevo en `apps/api`.
- `git status --short` (parent/spot-check).
- Excepción TDD: fase roja solamente; no hay GREEN/REFACTOR porque está prohibido implementar producción. Política aplicable = confirmar ROJO por razón esperada.

## Progreso
- 2026-10-12: documento creado, rama/base verificados, listo para T1.

## Evidencia verificación
- Writer (general): `rf008-anulacion-cuota.spec.ts` 30 failed ROJO-E; `rf008-anulacion-cuota-efectos.spec.ts` 8 failed ROJO-E + 2 passed VERDE-I ([E1] en `finanzas.service.ts:1934-1936`, [E6] en `finanzas.service.ts:1605-1614`); e2e 11 skipped por falta de `E2E_DATABASE_URL` (sin inventar). `.env` no leído. Sin BLOCKERs.
- Parent spot-check 2026-10-12: `ls` confirma 3 specs + reporte `01-anulacion-cuotas-tests.reporte.md` (15576 bytes); `git status --short` muestra solo `??` de los 3 specs nuevos (+ `?? odd/` del documento ODD) y los `M`/`??` ajenos preexistentes de Entrenamiento intactos; el reporte no sale en `git status` porque `.opencode-prompts/` está ignorado (`.gitignore:65`), pero existe en disco en la ruta pedida. Sin commit por prohibición expresa del prompt (excepción a work-unit commit ODD).

## Siguiente paso
- ~~Lote GREEN~~: hecho en `7f46acc` (anulación de cuotas sin pagos con devolución del saldo a favor aplicado, RF-008) con su doc-sync en `ac976a5`. **ODD cerrado (2026-10-15).**

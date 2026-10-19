# mis-alumnos-tests — Lote "Mis alumnos" tests en rojo
Objetivo: ejecutar exactamente `.external-agents/01-mis-alumnos-tests.md` con subagentes y dejar reporte en ruta indicada. Rama: `main` (ref `59269ab`). Estrategia: `ask-on-risk`. Runner: `vitest` via `pnpm --filter`.

## Specs
- S1: "Lee y ejecuta exactamente el prompt .external-agents/01-mis-alumnos-tests.md" — Escribir los tests de los contratos A-D, ejecutarlos y confirmar que fallan por la razón esperada: falta el campo, el parámetro, la función o el texto. No deben fallar por errores de importación del propio test ni de configuración.
- S2: "deja el reporte en la ruta que indica" — Ruta: `.external-agents/reportes/01-mis-alumnos-tests.reporte.md`. Contenido: Resumen; Archivos creados y editados con nº líneas; Por cada caso existente modificado: línea, cambio y motivo; Comandos ejecutados con resultados; Por cada contrato A1…D11: CUMPLE/NO con mensaje de fallo; Bloqueos o ambigüedades.
- S3: "Utiliza subagentes" — Todo trabajo de mapeo/escritura/ejecución via subagentes delegados.
- Supuesto: superficie permitida y prohibiciones son las del prompt externo (crear 4 specs, editar 2 specs listados, prohibido leer `.env`, commit/push, deps, código prod). Detalle de contratos A1-D11 vive en `.external-agents/01-mis-alumnos-tests.md` y no se duplica aquí.

## Tasks
- [x] T1 (S1, delegated writer): API `mis-alumnos-directorio.spec.ts` contratos A1-A7 — creado `apps/api/test/bdd/mis-alumnos-directorio.spec.ts` (1085 líneas) — RED 24 failed | 2 passed (26) observado
- [x] T2 (S1, delegated writer): Shared `alumnos-directorio-orden.spec.ts` contratos B1-B2 — creado `packages/shared/src/schemas/alumnos-directorio-orden.spec.ts` (53 líneas) — RED 8 failed (8) observado vía web runner
- [x] T3 (S1, delegated writer): Web lógica C — creado `apps/web/src/lib/alumnos-directorio-actividad.spec.ts` (211) + editado `apps/web/src/lib/alumnos-directorio-filtros.spec.ts` (134) — RED 8 failed | 4 passed + suite no tests observado
- [x] T4 (S1, delegated writer): Web interacción D — creado `AlumnosPage.mis-alumnos.interaccion.spec.tsx` (558) + editados 9 casos caracterización (945) — RED 11 failed + 9 failed | 25 passed observado
- [x] T5 (S2+S3, inline tras T1-T4): reporte `.external-agents/reportes/01-mis-alumnos-tests.reporte.md` escrito y verificado — Comandos: shared test LAST:0 no-op, api 24|2, web 28|29 (filtros 8|4, actividad no tests, mis-alumnos 11, caracterizacion 9|25)

## Log
- L1 (2026-10-19): "Lee y ejecuta exactamente el prompt .external-agents/01-mis-alumnos-tests.md y deja el reporte en la ruta que indica. Utiliza subagentes"
- L2: Explorer `ses_eaabfba14ffe5nt9QHyX6TjieB` devolvió mapa: BDD usa mock drizzle sin DB real; shared sin runner test ni specs; `OrdenDirectorioAlumnos`/`orden` no existen; actividad.ts no existe; filtros web sin `orden`; comandos reales usan `@guachafit/api` y `@guachafit/web`.

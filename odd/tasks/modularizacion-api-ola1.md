# Feature: modularizacion-api-ola1 (servicios del API de 900 líneas o más y contratos compartidos)

## Objetivo
Partir los servicios grandes del API en casos de uso pequeños, con una responsabilidad cada uno, para que los cambios futuros sean quirúrgicos: tocar un caso de uso no debe arrastrar a otro. No cambia el comportamiento observable (HTTP, base de datos, eventos, colas). Además, se parten por dominio los dos índices de contratos de `packages/shared` y se estabiliza el test inestable W-52-2 de la web.

## Inventario (medido 2026-10-13, base `fb87b92`)

| # | Módulo (carpeta de reportes) | Archivo | Líneas | Specs que lo usan |
|---|---|---|---|---|
| A1 | `api-finanzas` | `apps/api/src/modules/finanzas/finanzas.service.ts` | 3386 | 18 (`new FinanzasService`; 18 accesos `as any`) |
| A2 | `api-entrenamiento` | `apps/api/src/modules/entrenamiento/entrenamiento.service.ts` | 2221 | 8 |
| A3 | `api-alumnos` | `apps/api/src/modules/alumnos/alumnos.service.ts` | 1431 | 12 (6 con `createTestingModule`) |
| A4 | `api-auth` | `apps/api/src/modules/auth/auth.service.ts` | 1279 | 13 (11 con `createTestingModule`) |
| A5 | `api-antropometria` | `apps/api/src/modules/antropometria/antropometria.service.ts` | 975 | **2** |
| A6 | `api-cartera` | `apps/api/src/modules/finanzas/cartera.service.ts` | 939 | **3** |
| A7 | `api-nutricion` | `apps/api/src/modules/nutricion/nutricion.service.ts` | 911 | 4 |
| S1 | `shared-schemas` | `packages/shared/src/schemas/index.ts` | 1779 | todo el monorepo (typecheck) |
| S2 | `shared-types` | `packages/shared/src/types/index.ts` | 1435 | todo el monorepo (typecheck) |

**Ola 2 del API (ODD posterior, 401–899 líneas):** `plantillas.service.ts` (609), `antropometria-periodicidad.util.ts` (517), `antropometria-recordatorio.processor.ts` (493), `finanzas.controller.ts` (470), `notification-dispatcher.service.ts` (463), `resumen-semanal.processor.ts` (436), `entrenador.service.ts` (432) y `validar-configuracion-produccion.ts` (403). Quedan como excepciones explícitas del guardián del API.

## Reglas (vinculantes)
Se heredan de la web: R7 (instantáneas), R10 (un prompt por módulo de punta a punta), R12 (3 corridas en verde), R13 (reportes por partes) y R14 (sin subagentes), de los ODD web.

**P1. Fachada intacta.** El servicio Nest conserva:
- su archivo, el nombre de la clase y sus decoradores;
- su **constructor idéntico**: mismos parámetros, mismo orden, mismos `@Inject`/`@Optional`;
- **todos** sus métodos públicos;
- los métodos privados que los specs usan con `as any` (el inventario de cada módulo debe listarlos).

Esos métodos pasan a delegar. Los specs hacen `new Servicio(db, …)` y `createTestingModule`, y ninguno de los dos puede romperse.

**P2. Casos de uso sin wiring nuevo.** Las piezas viven en `src/modules/<modulo>/casos-<servicio>/`. Pueden ser funciones o clases planas, y reciben un **contexto de dependencias explícito** (`{ db, withTenant, eventEmitter, … }`) que la fachada construye en su constructor. Se prohíbe registrarlas como providers nuevos de Nest, porque cambiaría el wiring y los tests que hacen `new`.

**P3. Semántica de datos idéntica.** Se conservan exactamente:
- el **orden y la forma de las llamadas a `db`/`tx`** (los mocks de los specs dependen de él);
- los límites de transacción y los bloqueos (`FOR UPDATE`);
- el envoltorio `withTenant` en toda consulta con RLS (ADR-009, ADR-011);
- los nombres y payloads de eventos (ADR-010) y de trabajos de cola;
- los códigos HTTP y los códigos y mensajes de error.

**P4. Invariantes financieras intocables** (RNF-002, ADR-003, ADR-020): en `api-finanzas` y `api-cartera`, cualquier diferencia de comportamiento es un BLOCKER, no un hallazgo menor. Los módulos `api-finanzas`, `api-cartera` y `api-auth` aplican además la lente de riesgo en su revisión.

**P5. Tamaños:**
- fachada ≤ 400 líneas (son delegaciones);
- caso de uso ≤ 300, con objetivo de 250;
- la lógica pura sin I/O va en `casos-<servicio>/*-reglas.ts`, con specs unitarias nuevas permitidas.

**P6. Red de tests:**
- Los specs existentes no se editan y mantienen su conteo en verde.
- Si un caso de uso no tiene cobertura, se escribe un spec de caracterización nuevo en `apps/api/test/bdd/<modulo>-caracterizacion-<tema>.spec.ts`, al estilo de los existentes (db simulada), en verde sobre el código previo.
- Los `*.e2e.spec.ts` se ejecutan solo si `E2E_DATABASE_URL` está disponible. Si no, se reportan como omitidos, sin inventar resultados.

**P7. Contratos compartidos (S1, S2):** partir por dominio en `schemas/<dominio>.ts` y `types/<dominio>.ts`, con `index.ts` como barril (`export * from './<dominio>'`). Sin renombrar, sin cambiar ningún esquema ni tipo y sin cambiar la ruta pública `@guachafit/shared`. Los conflictos de `export *` los detecta `tsc`.

**P8. Comandos:**
- `pnpm --filter @guachafit/api exec vitest run <spec>`
- `pnpm --filter @guachafit/api test`
- `pnpm --filter @guachafit/api typecheck`
- `pnpm --filter @guachafit/api build`
- Para `packages/shared`: el typecheck de shared, api y web.

## Fases

| Fase | Prompts | Paralelo | Salida |
|---|---|---|---|
| **M. Servicios** | `100`–`106` | Sí, los 7 | `reportes/<modulo>/10x-<modulo>-validacion.reporte.md` |
| **F. Test inestable web** | `107` | Sí (paquete distinto) | `reportes/web-flake-cache/` |
| **S. Contratos compartidos** | `108`, `109` | Sí entre sí; después de M | `reportes/shared-*/` |
| **D. Cierre** | `110` | No | Guardián del API, verificación del monorepo y borrador de ADR-023 → `reportes/cierre-api-ola1/` |
| **R. Revisión 4R** | `111`–`114` | Sí, los 4 (solo lectura) | `reportes/cierre-api-ola1/11x-review-*.reporte.md` |

Orden: (M ∥ F) → S → D → R. Si R encuentra BLOCKERs, Claude redacta un prompt `validacion` de corrección.

## Checklist
- [x] M: `100`–`106`.
- [x] F: `107`.
- [x] S: `108`, `109` (+ corrección `115`).
- [x] D: `110`.
- [ ] R: `111`–`114`.
- [ ] Claude: verificación contra el diff, un commit por módulo, ADR-023, `docs(vault)` y limpieza.

## Criterios de aceptación
- Las 7 fachadas quedan ≤ 400 líneas, y ningún caso de uso pasa de 300. Los dos índices de `shared` quedan como barriles.
- Los specs existentes no se editan y mantienen su conteo en verde. Los de caracterización pasan en verde sobre el código previo.
- Typecheck y build en verde en `shared`, `api` y `web`. Suites de `api` y `web` en verde.
- `apps/api/src/tamano-archivos.spec.ts` en verde, con excepciones solo para la Ola 2 del API.
- W-52-2 resuelto: el spec `EntrenamientoPage.cache` pasa 10 de 10 dentro de la suite completa.
- Revisión 4R sin BLOCKERs abiertos.

## Progreso
- 2026-10-13: ODD creado y prompts `100`–`114` redactados.
- 2026-10-13 (Claude): fases M y F verificadas contra el diff.
  - Fachadas: finanzas 3386 → 282, entrenamiento 2221 → 334, alumnos 1431 → 240, auth 1279 → 194, antropometría 975 → 171, cartera 939 → 251 y nutrición 911 → 182. El caso de uso más grande tiene 289 líneas (`emision-programada.caso.ts`).
  - Constructores, decoradores, métodos públicos, exports de módulo y privados usados con `as any` intactos.
  - Sin cambios en ningún `*.module.ts` ni en ningún spec existente.
  - Conteos de llamadas idénticos entre el servicio original y la fachada con sus casos: `withTenant(`, `FOR UPDATE`, transacciones, eventos y colas, `throw new`, `insert`/`update`/`delete`, `Math.round`/`toFixed` y códigos de error.
  - W-52-2: presupuesto de 20 s y reintento acotado del clic; los 6 `expect` intactos.
  - E2E omitidos (no hay `E2E_DATABASE_URL`).
  - Commits `5033c85`..`7ce6c9e`.

- 2026-10-13 (Claude): fase S verificada contra el diff, con la corrección `115`.
  - `schemas/index.ts` (1779) y `types/index.ts` (1435) quedan como barriles de 11 líneas, con 11 archivos de dominio cada uno; el más grande tiene 341 líneas (`schemas/notificaciones.ts`). Exports idénticos: 169 y 142.
  - El `108` había duplicado 3 auxiliares no exportados (`campoPesoKg`, `campoRpe` y `fechaCalendarioRealSchema`). Ahora viven una sola vez en `schemas/campos-internos.ts`, fuera del barril.
  - **Excepción a P6 autorizada por Claude:** dos specs leían el código fuente por la ruta de `index.ts`. `api2-errores-claros` tenía un test en rojo y otro que pasaba en vacío; `rf005-rf008` tenía uno en rojo que el `109` no detectó porque solo ejecutó typechecks. Ahora leen la carpeta completa, con los mismos tests y aserciones; el test de jerga sigue analizando 224 literales, igual que en HEAD.
  - Resultados: API 1801 tests en verde x3 (29 omitidos, e2e), web 2105/2105, typechecks 0 y build en verde.
  - Commits `3f3b445` y `091a0f5`.
  - **Lección:** un prompt que mueve código debe ejecutar la suite completa de los paquetes que lo consumen, no solo el typecheck. Hay specs que leen el código fuente por ruta.

- 2026-10-13 (Claude): `110` verificado.
  - Guardián `apps/api/src/tamano-archivos.spec.ts` en verde (4/4), con exactamente 8 excepciones: los archivos de la Ola 2 del API.
  - API: 1805 tests, typecheck 0 y build en verde. Web: 2105 tests, typecheck 0 y build en verde. Shared: typecheck 0.
  - Borrador `04_Decisiones/ADR-023-casos-de-uso-servicios-api.md` (propuesto).
  - Pendiente menor: los comentarios del guardián están en inglés, mientras que el de la web está en español.

## Siguiente paso
- El dueño lanza `111`–`114` en paralelo (solo lectura).

# Feature: modularizacion-api-ola2 (archivos del API de 401 a 899 líneas y normalización de la Ola 1)

## Objetivo
Dejar por debajo del tope de 400 líneas los 8 archivos que el guardián del API aún exceptúa (`EXCEPCIONES_API_OLA2_NO_TRABAJADA`) y unificar los nombres de la Ola 1 que señaló la revisión de legibilidad. No cambia el comportamiento observable (HTTP, base de datos, eventos, colas y validación de arranque). Al cerrar, el guardián del API queda sin excepciones.

## Reglas
Son vinculantes, sin repetirlas:
- P1–P8 de `odd/tasks/modularizacion-api-ola1.md`;
- [[ADR-023-casos-de-uso-servicios-api]];
- §6, reglas 14 y 15.

Ajustes propios de esta ola:
- **Q1. Idioma.** Comentarios, JSDoc, títulos de test y reportes en español neutro. Los comentarios movidos se conservan palabra por palabra; no se traduce nada al inglés. Al final de cada módulo se mide con `grep` que no haya entrado inglés nuevo.
- **Q2. Forma según el tipo de archivo:**
  - **Servicio** (B1, B5, B7): fachada y `casos-<servicio>/`, como en la Ola 1.
  - **Processor de BullMQ** (B3, B6): la clase conserva su archivo, sus decoradores (`@Processor`, `@OnWorkerEvent`…), su constructor y la firma de `process`. Los pasos van en `processors/<nombre>/`, y la cola, el nombre del trabajo, los reintentos y el manejo de errores quedan idénticos.
  - **Utilidad con muchos exports** (B2, B8): el archivo original pasa a ser un barril (`export * from './<carpeta>/<tema>'`) con la MISMA lista de exports. Los temas van en una carpeta hermana. Los imports de los consumidores no se tocan.
  - **Controlador** (B4): sigue siendo UN controlador, sin dividirlo en varios y sin tocar `finanzas.module.ts`. Conserva cada ruta con su verbo, su ruta, sus guards, `@Roles`, `@HttpCode` y la firma de su método. Lo que se extrae es la lógica que no es de transporte (resolver el contexto del actor, parsear la consulta, armar respuestas) a `finanzas/controlador-finanzas/*.ts`. La tabla de rutas (verbo, ruta, guards, roles y código) debe ser idéntica antes y después.
- **Q3. Convención de nombres** (decisión de Claude del 2026-10-13, aplicada a la Ola 1 y a la Ola 2):
  - archivos de caso de uso sin sufijo: `anular-cuota.ts`, no `anular-cuota.caso.ts`;
  - la lógica pura en `*-reglas.ts`;
  - el contexto en `contexto-<servicio>.ts`;
  - el campo de la fachada se llama `ctx`;
  - un archivo agrupa una sola responsabilidad que su nombre dice (nada de `soporte-*` genéricos).
- **Q4. Tests en paralelo:** cada módulo ejecuta SUS specs 3 veces (R12) y su typecheck. La suite completa del API se ejecuta solo en el cierre, en 3 corridas secuenciales, porque en paralelo dan timeouts ajenos (112-W2 de la Ola 1).
- **Q5. Lente de riesgo** en B4 (finanzas), B5 (notificaciones) y B8 (validación de la configuración de producción).

## Inventario (medido 2026-10-13, base `54326f2`)

| # | Módulo (carpeta de reportes) | Archivo | Líneas | Tipo | Specs que lo usan |
|---|---|---|---|---|---|
| B1 | `api-plantillas` | `apps/api/src/modules/entrenamiento/plantillas.service.ts` | 609 | servicio | 3 |
| B2 | `api-antropometria-periodicidad` | `apps/api/src/modules/antropometria/antropometria-periodicidad.util.ts` | 517 | utilidad (23 exports) | 4 |
| B3 | `api-antropometria-recordatorio` | `apps/api/src/modules/antropometria/processors/antropometria-recordatorio.processor.ts` | 493 | processor (7 exports) | 2 |
| B4 | `api-finanzas-controller` | `apps/api/src/modules/finanzas/finanzas.controller.ts` | 470 | controlador (21 rutas) | 10 |
| B5 | `api-notification-dispatcher` | `apps/api/src/modules/notificaciones/notification-dispatcher.service.ts` | 463 | servicio | 6 |
| B6 | `api-resumen-semanal` | `apps/api/src/modules/notificaciones/processors/resumen-semanal.processor.ts` | 436 | processor (5 exports) | 2 |
| B7 | `api-entrenador` | `apps/api/src/modules/entrenador/entrenador.service.ts` | 432 | servicio | 4 |
| B8 | `api-validar-configuracion` | `apps/api/src/common/config/validar-configuracion-produccion.ts` | 403 | utilidad (16 exports) | 2 |
| N1 | `api-normalizacion-ola1` | `apps/api/src/modules/*/casos-*/` y las 7 fachadas de la Ola 1 | — | nombres (Q3) | los `*-reglas.spec.ts` de `casos-*` |

**N1 en detalle** (hallazgos 114-W1, W3, W4 y W6 de la Ola 1):
- renombrar los 22 `*.caso.ts`;
- `contexto-casos.ts` (alumnos y auth) y `contexto.ts` (entrenamiento) pasan a `contexto-<servicio>.ts`;
- el campo `casos`/`contexto` pasa a `ctx` en alumnos, auth y nutrición;
- partir `casos-finanzas/soporte-finanzas.ts` y `bandeja-historial.caso.ts` por responsabilidad;
- llevar la orquestación de `CarteraService.obtenerCartera` a `casos-cartera/obtener-cartera.ts`.

Ningún spec fuera de `casos-*` importa estos archivos (comprobado con `grep`).

Objetivo de tamaño: el archivo original (fachada, barril, processor o controlador) ≤ 250 líneas y cada pieza ≤ 250, con 300 como máximo.

## Fases

| Fase | Prompts | Paralelo | Salida |
|---|---|---|---|
| **M. Módulos** | `120`–`127` | Sí, los 8 | `reportes/<modulo>/12x-<modulo>-validacion.reporte.md` |
| **N. Normalización** | `128` | Sí, con M (superficie distinta) | `reportes/api-normalizacion-ola1/` |
| **D. Cierre** | `129` | No | `EXCEPCIONES_API_OLA2_NO_TRABAJADA` vacía, suite completa x3 secuencial, typecheck y build del monorepo → `reportes/cierre-api-ola2/` |
| **R. Revisión 4R** | `130`–`133` | Sí, los 4 (solo lectura) | `reportes/cierre-api-ola2/13x-review-*.reporte.md` |

Orden: (M ∥ N) → D → R. Si R encuentra BLOCKERs, Claude redacta un prompt `validacion` de corrección.

## Checklist
- [x] M: `120`–`127`.
- [x] N: `128`.
- [ ] D: `129`.
- [ ] R: `130`–`133`.
- [ ] Claude: verificación contra el diff, un commit por módulo, `docs(vault)` y limpieza.

## Criterios de aceptación
- Los 8 archivos quedan ≤ 250 líneas (300 como máximo) y ninguna pieza nueva pasa de 300.
- Exports, constructores, decoradores y métodos públicos idénticos. En B4, tabla de rutas idéntica.
- Los specs existentes no se editan y mantienen su conteo en verde. Excepción: los `*-reglas.spec.ts` de `casos-*` en N1, solo en la ruta del import.
- `EXCEPCIONES_API_OLA2_NO_TRABAJADA` vacía y el guardián del API en verde.
- Suite completa del API en verde en 3 corridas secuenciales; web en verde; typecheck y build en verde en shared, api y web.
- Sin inglés nuevo en comentarios (Q1).
- Revisión 4R sin BLOCKERs abiertos.

## Progreso
- 2026-10-13: ODD creado y prompts `120`–`133` redactados.
- 2026-10-13 (Claude): fases M y N verificadas contra el diff.
  - Archivos: plantillas 609 → 160, periodicidad 517 → 27 (barril), recordatorio 493 → 267, `FinanzasController` 470 → 240, despachador 463 → 173, resumen semanal 436 → 97, entrenador 432 → 50 y validación de configuración 403 → 31 (barril). La pieza más grande tiene 244 líneas. El reporte del `122` decía 237 líneas para el recordatorio; mide 267, dentro del máximo de 300.
  - Constructores, decoradores, métodos públicos y exports intactos. En `FinanzasController`, la tabla de las 21 rutas es idéntica (verbo, ruta, guards, roles, `@HttpCode` y firma).
  - Conteos idénticos en los 8 módulos y en la normalización: `withTenant(`, `FOR UPDATE`, transacciones, eventos y colas, `throw`, DML y literales de error.
  - **Corrección de Claude en el `127`:** el barril con `export *` exponía 10 auxiliares internos nuevos (`problemasCors`, `primerValor`…). Ahora reexporta de forma explícita los 16 nombres originales; typecheck 0.
  - `128`: 21 renombres sin `.caso`, 3 contextos `contexto-<servicio>.ts`, campo `ctx` en las 7 fachadas, `soporte-finanzas` y `bandeja-historial` partidos, y `CarteraService` 227 → 111.
  - Sin specs existentes editados, sin cambios en `*.module.ts`. Inglés nuevo en comentarios: 1 línea en total.
  - Commits `83b658a`..`dbe13a2`.

## Siguiente paso
- El dueño lanza `129`.

# Feature: modularizacion-vistas-web (vistas del front partidas en componentes atómicos)

## Objetivo
Partir las vistas de `apps/web` que superan las 1000 líneas en componentes pequeños, con una sola responsabilidad cada uno, separando los **reutilizables** (sirven a más de una vista) de los **únicos** (solo tienen sentido en su vista), sin cambiar el comportamiento observable.

## Problema
Ocho vistas pasan de 1000 líneas y siguen creciendo (`AlumnoDetallePage` tiene 5016). Mezclan en un mismo archivo los datos (queries y mutaciones), las reglas de la vista y el JSX de varias pestañas. Las consecuencias:
- Los cambios cuestan caro y arrastran conflictos, porque todo pasa por el mismo archivo.
- Se duplican piezas: el estado de carga, vacío o error, los badges y las filas de serie se reescriben en cada vista.
- Las reglas de §6 (44px, 11px, AA, estados honestos) se vuelven a aplicar a mano en cada copia.

## Por qué
- Mantenibilidad y diseño basado en componentes (atomic design + container-presentational).
- Las revisiones se pueden hacer sin leer 3000 líneas.
- Las convenciones de §6 se cumplen una vez en el componente compartido y no en cada copia.

## Inventario de módulos (medido 2026-10-12, `wc -l`, sin specs)

### Ola 1: más de 1000 líneas (este ODD)

| # | Módulo (carpeta de reportes) | Archivo | Líneas | Specs de interacción existentes |
|---|---|---|---|---|
| M1 | `alumno-detalle` | `apps/web/src/pages/entrenador/AlumnoDetallePage.tsx` | 5016 | 7 (`AlumnoDetallePage.*.interaccion.spec.tsx`) |
| M2 | `entrenamiento` | `apps/web/src/pages/atleta/EntrenamientoPage.tsx` | 2950 | 6 (`EntrenamientoPage.*.interaccion.spec.tsx`) |
| M3 | `alumnos` | `apps/web/src/pages/entrenador/AlumnosPage.tsx` | 1306 | **0** |
| M4 | `pagos` | `apps/web/src/pages/atleta/PagosPage.tsx` | 1254 | 3 |
| M5 | `progreso` | `apps/web/src/pages/atleta/ProgresoPage.tsx` | 1188 | 4 |
| M6 | `nutricion` | `apps/web/src/pages/atleta/NutricionPage.tsx` | 1175 | 1 (`NutricionPage.spec.ts`, no de interacción) |
| M7 | `ajustes-entrenador` | `apps/web/src/pages/entrenador/AjustesPage.tsx` | 1098 | 1 |
| M8 | `plantillas` | `apps/web/src/pages/entrenador/PlantillasPage.tsx` | 1023 | **0** |

### Ola 2: de 700 a 999 líneas (ODD posterior, con las mismas reglas)
`PanelNutricionAlumno.tsx` (977), `SelectorPlantillaAsignacion.tsx` (948), `MonitorAdherenciaPage.tsx` (888), `CarteraPage.tsx` (864), `BloquesRutinaEditor.tsx` (830), `ConciliacionPage.tsx` (772).

### Ola 3: de 401 a 699 líneas (añadida el 2026-10-13, detectada por el guardián en la fase D)
`AntropometriaPage.tsx` (639), `AdminPage.tsx` (586), `GraficoEvolucion.tsx` (560), `AsignacionMasivaPlantilla.tsx` (544), `MatrizPreferenciasNotificacion.tsx` (467), `TablaCartera.tsx` (460), `OnboardingPage.tsx` (433), `DetalleSesionEntrenamiento.tsx` (413). Ninguno se tocó en este ODD. Quedan exceptuados en el guardián hasta su ODD.

### Fuera de alcance (registrado para no ocultarlo)
Servicios del API de más de 1000 líneas: `finanzas.service.ts` (3386), `entrenamiento.service.ts` (2221), `alumnos.service.ts` (1431) y `auth.service.ts` (1279). También los contratos `packages/shared/src/schemas/index.ts` (1779) y `types/index.ts` (1435). Necesitan su propio ODD de modularización por casos de uso; no son vistas.

## Reglas de diseño (vinculantes para todo el lote)

### R1. Capas atómicas y su ubicación
| Capa | Qué es | Dónde vive | Ejemplo |
|---|---|---|---|
| Átomo | Primitiva visual sin dominio ni datos | `apps/web/src/components/ui/` (nueva) | botón táctil de 44px, badge de estado, `EstadoCarga`, `EstadoVacio`, `EstadoError` con reintento |
| Molécula / organismo compartido | Pieza sin dominio, o de dominio transversal, que usan 2 o más vistas | `components/common/` o `components/<dominio>/` (ya existen) | `Paginacion`, `DialogoConfirmacion`, `FilaSerieEdicion` |
| Componente único de vista | Solo tiene sentido dentro de una vista | `components/<rol>/<modulo>/` (por ejemplo `components/entrenador/alumno-detalle/`) | `PestanaFinanzasAlumno`, `TarjetaCuotaAlumno` |
| Lógica pura | Cálculos, mapeos, reglas, formateo | `apps/web/src/lib/<modulo>-*.ts` (patrón ya vigente) | `cobro-sala.ts`, `alumno-detalle-tab.ts` |
| Hook de datos | Carga y mutaciones de la vista con el MISMO mecanismo que usa hoy (R9) | `components/<rol>/<modulo>/use-*.ts` | `useCuotasAlumno` |

- El archivo `pages/<rol>/<Vista>Page.tsx` **se queda en su ruta** (router y specs lo importan desde ahí) y pasa a ser un **contenedor orquestador**: lee los parámetros de ruta, compone las pestañas o secciones y conecta los hooks. No lleva JSX de detalle.
- Container-presentational: los componentes presentacionales reciben props tipadas y callbacks, y no llaman a `api-client` ni a `useQuery`. Los datos entran solo por hooks o contenedores.

### R2. Límites de tamaño
- Contenedor de página: **≤ 300 líneas**.
- Componente: **≤ 250 líneas** como objetivo y **400 como tope duro**. Pasar de 400 exige una justificación escrita en el reporte del módulo.
- Hook o archivo de lógica: ≤ 250 líneas.
- Una responsabilidad por archivo. Si el nombre necesita un "y", hay que partirlo.

### R3. Criterio de clasificación (reutilizable vs único)
Un componente es **reutilizable** si cumple al menos uno de estos puntos:
1. Ya existe un equivalente en otra vista (duplicación verificable con `archivo:línea` de ambas copias).
2. Es una primitiva sin dominio (átomo).
3. Representa una entidad de dominio que se muestra en 2 o más vistas (cuota, serie, check-in, alumno).

Si no cumple ninguno, es **único**. Ante la duda se marca **único** y se anota como "candidato". Se promueve en la consolidación (fase C), no antes. Nada se generaliza por especulación.

### R4. Contratos y convenciones
- Los tipos de las props vienen de `@guachafit/shared` cuando representan datos de dominio. Está prohibido redefinir en `apps/web` tipos que ya existen allí (§2.1).
- Cada componente extraído conserva §6: 44px táctil, 11px mínimo, tokens semánticos con variante clara y oscura, pesos ≤ 700, `formatearSegundos`, `pluralizar`, `entrada-numerica` + `LIMITES_SERIE` y estados honestos.
- Nombres en español, como en el código vigente (`PestanaPagos`, `useCuotasAlumno`).

### R5. Refactor sin cambio de comportamiento
- Los specs existentes **no se editan** y deben quedar en verde con el **mismo número de tests** antes y después.
- Los selectores accesibles (roles, labels, textos) que usan los specs se mantienen idénticos.
- Una vista sin specs de interacción (M3 `alumnos`, M8 `plantillas`) **no se refactoriza** hasta tener tests de caracterización en verde sobre el código actual.

### R6. Paralelismo seguro
- Cada trabajador toca **solo** su página y su carpeta `components/<rol>/<modulo>/` (y `lib/<modulo>-*.ts` nuevos).
- Mientras haya trabajadores en paralelo, **nadie** edita `components/ui/`, `components/common/`, `lib/` existentes ni `packages/shared`. Lo reutilizable se propone en el reporte y se consolida en la fase C, con un solo escritor.
- Los errores de typecheck o de suite en archivos de **otro** módulo no son del trabajador: los reporta y no los toca.


## Ejecución delegada a OpenCode (decisión del dueño, 2026-10-12)
- Todo el trabajo lo ejecuta **OpenCode**: inventario, caracterización, consolidación, extracción, revisión y verificación. Es un refactor sin cambio de comportamiento, así que la garantía son los tests (los existentes más los de caracterización) y las iteraciones de OpenCode. Es una excepción a §7.1, limitada a este ODD.
- **Modelo:** el dueño elige **Muse Spark 1.3** en la TUI para las fases B, B0, C y D. La sesión principal actúa como orquestadora y **aplica los cambios con subagentes** (contribuidores):
  - **Subagente escritor:** uno por sub-lote. Extrae el código y deja los tests en verde.
  - **Subagente revisor:** contexto fresco, solo lectura y distinto del escritor. Revisa el sub-lote contra R1–R6 y §6.
  - **Orquestador:** reparte el trabajo y verifica con los comandos. No acepta un "listo" de un subagente sin la salida real de los tests.
- **Iteraciones:** máximo 3 por sub-lote. Si tras la tercera siguen en rojo specs que antes estaban en verde, se restaura la instantánea del último estado verde (ver R7), se registra un BLOCKER y se pasa al siguiente sub-lote o se detiene el módulo.
- **Claude Code:** solo verifica cada reporte contra el `git diff` y hace los commits por módulo y el doc-sync. OpenCode nunca hace commit ni push.

### R7. Instantáneas de seguridad
Antes de cada sub-lote, el orquestador copia los archivos de su superficie a `.opencode-prompts/reportes/<modulo>/instantaneas/<sub-lote>/`. Los specs no se pueden "arreglar" para que pasen. Si no se logra el verde, se restaura la instantánea y se reporta.

### R9. Se conserva el mecanismo de datos (desde el inventario 40, BLOCKER B-2)
Este ODD no cambia la forma en que una vista obtiene sus datos. Si hoy usa `useEffect`/`useState` y paginación manual, el hook extraído encapsula exactamente eso. Introducir TanStack Query o `usePaginacionServidor` en una vista que no los usa rompe sus specs (los montan sin `QueryClientProvider`, y R5 prohíbe editarlos). Esa migración a §6.4 queda para un ODD posterior, con specs nuevos.

### R8. Comandos (siempre pnpm, §3)
- Spec puntual: `pnpm --filter @guachafit/web exec vitest run <ruta-relativa-a-apps/web>`
- Suite web: `pnpm --filter @guachafit/web test`
- Tipos: `pnpm --filter @guachafit/web typecheck`
- Build: `pnpm --filter @guachafit/web build`
- Tamaño: `wc -l <archivos>`
- En paralelo, el typecheck y la suite completa pueden fallar por el trabajo **de otro módulo**. Solo cuentan los errores en archivos de la superficie propia; el resto se lista como "ajeno".

## Fases

| Fase | Prompt(s) | Paralelo | Depende de | Salida |
|---|---|---|---|---|
| **A. Inventario** (solo lectura) | `40`–`47` | Sí, los 8 | — | `reportes/<modulo>/4x-<modulo>-review-readability.reporte.md` |
| **C. Consolidación de reutilizables** | `48-consolidacion-validacion` | No (escritor único) | A completa | Matriz de reutilizables, `components/ui/`, promociones a `common/`, borrador de ADR-022 → `reportes/consolidacion/` |
| **B0. Caracterización** | `49-alumnos-tests`, `50-plantillas-tests`, `60-alumno-detalle-tests` (pestaña entrenamiento + modal de rutina, BLOCKER B-1) | Sí entre sí y con C | A de su módulo | Specs de interacción en verde sobre el código actual → `reportes/<modulo>/` |
| **B. Extracción por vista** | `51`–`58` | Sí, un módulo por sesión | C (y B0 en M3/M8) | Vista partida + reporte de extracción + reporte del revisor → `reportes/<modulo>/` |
| **D. Cierre** | `59-cierre-verificacion` | No | B completa | Test guardián de tamaño, suite, typecheck y build globales, eliminación de duplicados residuales → `reportes/cierre/` |

Orden: A → (C ∥ B0) → B → D. La fase C va antes que B para que las vistas consuman los átomos ya consolidados y no los dupliquen.

## Superficie por fase
- **A:** solo escribe su reporte.
- **B0:** solo crea specs nuevos `pages/entrenador/<Vista>Page.caracterizacion.interaccion.spec.tsx` y su reporte. Sin producción.
- **C:** crea `components/ui/**` y puede promover a `components/common/` o a `components/<dominio>/` las piezas marcadas como REUTILIZABLES. Hasta la fase B no edita páginas, salvo para reemplazar una copia duplicada por el componente promovido cuando es mecánico y el spec de esa vista sigue en verde. Escribe el borrador `04_Decisiones/ADR-022-estructura-componentes-atomicos-web.md`.
- **B (módulo X):** su página, `components/<rol>/<modulo>/**` y `lib/<modulo>-*.ts` nuevos. Puede **importar** `components/ui`, `common` y `lib` existentes, pero no editarlos. Si necesita un reutilizable que no existe, lo deja en su carpeta marcado como CANDIDATO para D.
- **D:** test guardián `apps/web/src/tamano-archivos.spec.ts`, promoción final de CANDIDATOS duplicados y reportes de cierre.
- **Siempre prohibido:** editar specs existentes, `.env`, commit, push, dependencias nuevas, `apps/api`, `packages/database`, `packages/shared` (salvo un tipo faltante justificado en el reporte de C), `.claude/settings.json` y `Notas del 09-10-2026.md`.

## Restricciones
- Rama `main`. La base se fija al lanzar cada fase (`git rev-parse --short HEAD`) y se anota en el reporte.
- Hay otra sesión que comparte `main` (memoria `escritura-segura-scripts`). Antes de lanzar `52-entrenamiento` y `55-progreso`, el dueño confirma que no hay trabajo en curso sobre Entrenamiento (módulo 5 en pausa, ver handoff).

## Checklist
- [x] A: prompts `40`–`47` (inventario de M1–M8, en paralelo). Verificado 2026-10-12: 8/8 reportes escritos.
- [x] C: prompt `48` (consolidación de reutilizables + borrador de ADR-022).
- [x] B0: prompts `49`, `50` y `60` (caracterización de M3, M8 y la parte sin cubrir de M1).
- [x] B: prompts `51`–`58` (extracción por vista con subagentes; M1 y M2 en sub-lotes según su inventario).
- [x] D: prompt `59` (guardián de tamaño + verificación global + promoción de candidatos).
- [x] Claude: verificación de cada reporte contra el diff, commits por módulo y `docs(vault)` (§6 regla 14, ADR-022 aceptado, guía).

## Criterios de aceptación
- Ningún archivo de `pages/` o `components/` de los módulos M1–M8 pasa de 400 líneas, y cada contenedor de página tiene ≤ 300.
- Los specs existentes no se editaron, están en verde y conservan el mismo conteo de tests por archivo.
- `pnpm --filter @guachafit/web typecheck` y `build` en verde.
- Cada módulo tiene su carpeta de reportes con el inventario y la extracción. Cada componente figura como reutilizable o único, con su razón según R3.
- No quedan componentes duplicados entre vistas que la fase A haya marcado como reutilizables.
- `tamano-archivos.spec.ts` en verde: protege el tope de 400 líneas en adelante.

## Progreso
- 2026-10-12: ODD creado. Inventario de tamaños medido. Prompts `40`–`59` redactados. El dueño decide delegar toda la ejecución a OpenCode con Muse Spark 1.3 y subagentes.
- 2026-10-12: Fase A completada (8 subagentes en paralelo, solo lectura). 8/8 reportes en `.opencode-prompts/reportes/<modulo>/`, base `df33d9c`, 182–366 líneas cada uno. BLOCKERs: M1 ×2 (cobertura de specs cero en la pestaña entrenamiento y el modal de rutina; `usePaginacionServidor` no adoptable sin romper los 7 specs que montan sin `QueryClientProvider`) y M3 ×1 (0 specs → B0 obligatorio). En Windows medir con `(Get-Content f).Count`: `Measure-Object -Line` omite líneas vacías. Otra sesión paralela añadió entradas ajenas a `git status` (`offline-*.spec.ts`, `envios-en-vuelo.spec.ts`, `EntrenamientoPage.orden.interaccion.spec.tsx`).
- 2026-10-12 (Claude): reportes verificados en disco. Los BLOCKERs de M1 se resuelven con el prompt nuevo `60` (caracterización de la pestaña entrenamiento + modal de rutina) y la regla R9 (no se cambia el mecanismo de datos). Prompts `48` y `51` actualizados. El de M3 se resuelve con `49`.
- 2026-10-12 (Claude): C y B0 ejecutadas. B0 en verde, dos corridas cada uno: `AlumnosPage.caracterizacion` 34/34, `PlantillasPage.caracterizacion` 18/18, `AlumnoDetallePage.caracterizacion` 27/27. C creó `components/ui/` (6 átomos con spec) y el borrador de ADR-022, sin tocar páginas; su reporte quedó truncado (65 líneas, faltan §3–7) → prompt `61` para rehacerlo.
- 2026-10-13 (Claude): reporte 48 rehecho por el `61` y verificado (123 líneas, §1–7, guía por módulo completa). Resultados: `ui/` 22/22; suite web 1729/1739 (los 10 fallos son ajenos, de la fase roja E9 de otra sesión); typecheck con 7 errores, 6 ajenos y 1 propio del lote: TS2783 en `AlumnoDetallePage.caracterizacion.interaccion.spec.tsx:144` (`nombre` duplicado antes de `...parcial`). Se corrige como paso 0 de la fase B.
- 2026-10-13 (Claude): fase B verificada contra el diff para M1, M3, M4, M6, M7 y M8. Contenedores: 300, 225, 205, 298, 258 y 224. Ningún archivo nuevo pasa de 400 líneas. Solo se modificaron las 6 páginas: ningún spec existente del lote, ni `common/`, ni `lib/` existente, ni `router.tsx`. Los `lib/` nuevos llevan el prefijo de su módulo y R9 se respetó. Excepciones R2 justificadas en el reporte 51: 4 hooks de M1 entre 260 y 374 líneas y `ContenidoRutinaSemanal` con 397. BLOCKER-51-1: el editor no converge con `BloquesRutinaEditor` sin romper R5; queda como recorte verbatim pendiente para D o para un ODD posterior.
- 2026-10-13 (Claude): commits `3b71c5b`..`f75fb48` (ui + 6 módulos) y `1b06b91` (docs). M5 `progreso` verificado (contenedor 1188 → 245, 9/9 tests sin editar, solo su superficie) y commiteado en `837fa70`. M2 `entrenamiento`: el `52` se detuvo en la tarea 0, sin cambios (BLOCKER-52-1), porque `EntrenamientoPage.orden.interaccion.spec.tsx`, de la sesión E9, está en rojo 2/6.
- 2026-10-13 (Claude): M2 `entrenamiento` verificado (2950 → 285, 30/30 con `--testTimeout=20000`, typecheck limpio, solo su superficie) y commiteado en `e0be785`. Fase B cerrada 8/8. Observaciones: el caso (c) del spec `cache` es sensible a la carga (W-52-2); el `52` no tuvo subagentes (W-52-1); se añadió `min-h-11` en 2 controles (§6.8).
- 2026-10-13 (Claude): fase D (`59`) verificada. Typecheck 0 errores, build en verde, suite 1816/1817. El único rojo es el guardián nuevo (BLOCKER-59-1): 8 archivos de 401–699 líneas que este ODD no clasificaba, un hueco del diseño de las olas. Se añade la Ola 3 y el prompt `62` para exceptuarlos. Se promovieron 0 candidatos (pares no mecánicos). BLOCKER-51-1, el editor de rutina duplicado con `BloquesRutinaEditor`, pasa al ODD de la Ola 2, que incluye ese editor.

- 2026-10-13 (Claude): el `62` resolvió BLOCKER-59-1. Guardián 4/4 ×3, typecheck 0 y suite 1817/1818; el único fallo es el flake W-52-2, que pasa 3/3 ejecutado solo. Commit `f5a0bd7`. ADR-022 pasa a `aceptado`, se añade la regla 14 en la §6 de `00_Reglas_Desarrollo_SDD.md` y se borran los prompts y reportes 40–62. **ODD cerrado (Ola 1).**

## Siguiente paso
- ODD de la Ola 2 (700–999 líneas), que incluye la convergencia del editor de rutina de M1 con `BloquesRutinaEditor` (BLOCKER-51-1).
- ODD de la Ola 3 (401–699 líneas).
- Opcional: estabilizar el caso (c) de `EntrenamientoPage.cache.interaccion.spec.tsx` (W-52-2) dándole un `timeout` propio a `findByRole`.
- ODD aparte para los servicios del API de más de 1000 líneas.

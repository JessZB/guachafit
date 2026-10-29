---
id: HANDOFF-RETOMA
titulo: "Handoff: retomar el trabajo con los lotes de la auditoría UX de las vistas del entrenador y del alumno"
fecha: 2026-10-28
estado: activo
tags:
  - handoff
  - retoma
  - orquestador
  - ux
  - metodologia
---

# 🔁 Prompt de retoma (copiar y pegar al inicio de la próxima sesión)

> Para usarlo, abre una sesión nueva en la bóveda GUACHAFIT y pega el bloque de abajo tal cual. Los hallazgos y el plan de lotes están en [[Auditoria_UX_Vistas_2026-10-28]].

```markdown
# Retomar: lotes de la auditoría UX/UI de GUACHAFIT, sesión nueva

Repo/vault: C:\Users\jesus\OneDrive\Documentos\Obsidian Vault\Trabajo\GUACHAFIT
Rama `main`, que sigue a `origin/main` en el repo PRIVADO https://github.com/JessZB/guachafit. No cambies la visibilidad.
Push solo cuando yo lo pida explícitamente.

## Qué hay que hacer
Trabajar, lote a lote, el plan de 00_Inbox/Auditoria_UX_Vistas_2026-10-28.md (141 hallazgos, 41 ALTA; 29 lotes UX-01…UX-29; 10 decisiones D1–D10).
- Empieza por las fundaciones transversales, en orden:
  - **UX-01** extraer `ui/BarraTabsSegmentada` desde `components/entrenador/alumno-detalle/PestanasFichaAlumno.tsx` + `lib/use-tabs-accesibles.ts`. `PestanasFichaAlumno` queda como wrapper con el mismo DOM y sus specs no cambian.
  - **UX-02** regla global `motion-reduce`.
  - **UX-03** piezas compartidas de formulario y formato.
  - **UX-04** cabecera: sincronización táctil y menú "Cuenta".
- Después, por área: Cobros (UX-05…10), Seguimiento (UX-11…16), Ajustes y Plantillas (UX-17…20) y Alumno (UX-21…29).
- Los lotes marcados ⛔ dependen de una decisión mía (sección 4 del documento). Pregúntamela cuando llegues a ese lote, UNA a la vez, con la recomendación que trae el documento y su porqué.
- Antes de cada lote, vuelve a leer el código citado (`archivo:línea`): la auditoría fue estática y los anchos a 360px son inferidos.
- Los reportes originales de cada área están en `.external-agents/auditoria-ux/01…05-*.md` (y el brief en `00-brief.md`). La carpeta está en `.gitignore`; bórrala solo cuando se cierren todos los lotes.

## Flujo de trabajo (reglas en 00_Reglas_Desarrollo_SDD.md §7)
- **Tú (Claude)** orquestas y validas. Defines los contratos, revisas cada diff y cada reporte contra `git status`/`git diff`, haces el doc-sync y los commits. No escribes ni ejecutas tests.
- **El código de producción lo escribe un subagente Haiku** (`model: haiku`, `effort: high`) con un prompt autocontenido. Restricciones del prompt: solo producción, nada de specs, tests ni builds, ni leer `.env`. Pídele el cómputo de líneas del guardián y que liste los specs que se romperán.
- **Tests y revisiones los hace un agente externo** con prompts en `.external-agents/<NN>-<lote>-<tipo>.md`. El reporte va en `.external-agents/reportes/<mismo>.reporte.md`. Yo los ejecuto pegando exactamente:
  `Lee y ejecuta exactamente el prompt .external-agents/<archivo>.md y deja el reporte en la ruta que indica.`
  NUNCA ejecutes tú al agente externo.
- **Ciclo por lote:**
  1. Tests en fase roja, con contratos exactos (el prompt sirve también de especificación para Haiku).
  2. Haiku implementa y tú revisas el diff.
  3. Verificación en paralelo con la revisión. Revisión de 1 enfoque si el riesgo es medio. Los 4 enfoques (risk, reliability, resilience, readability) si toca dinero, datos o seguridad, o si el diff de producción pasa de 400 líneas (cuéntalo con `git diff --numstat`, incluidos los archivos nuevos vía `git add -N`).
  4. Corrección con Haiku.
  5. Validación.
  6. Commit de código y commit `docs(vault): …` (RF afectado + `06_Guia_Pruebas_Manuales.md`).
  7. Borrar los prompts y reportes del lote.
- **Autorizaciones de specs:** en la fase roja el agente externo no toca specs existentes; solo lista los que se romperán. En la verificación autoriza explícitamente los ajustes de texto, selector u orden, sin debilitar aserciones.
- **Commits:** convencionales, en español, SIN Co-Authored-By. Usa `git add <archivos del lote>` o `git add -A apps/web/src` cuando el lote borre archivos.
- **Archivos fuera del trabajo:** `.claude/settings.json` y `Notas del 09-10-2026.md` quedan sin seguimiento.
- **Pruebas manuales:** yo pruebo con `pnpm dev`. NO me pidas build, preview ni incógnito, salvo cambios que dependan del Service Worker.
- **Editar textos con comillas o backticks:** usa la herramienta Edit, o un script Python escrito con Write (los heredocs de Bash fallan con comillas).

## Lecciones que aplicar en cada lote
- **Guardián de tamaño** (`apps/web/src/tamano-archivos.spec.ts`): cuenta `split(/\r?\n/).length`, que es `wc -l` + 1. El tope es 400 por archivo. Las páginas deben quedar en 300 o menos (regla §6/ADR-022); el guardián solo lo impone a los contenedores ya trabajados. `DashboardPage.tsx` (386) y `AtletaMenuPage.tsx` (365) son deuda frente a esa regla.
- **Fechas de la API:** suelen llegar en ISO con hora (`toISOString`). Para ISO usa `formatFechaLocal`; `formatFechaCalendario` solo acepta `YYYY-MM-DD`. **Los fixtures de los tests deben usar el formato real de la API**: un fixture irreal escondió un BLOCKER en L7.
- **jsdom:** no calcula layout ni hace hit-testing, así que las clases se fijan solo donde no hay alternativa. `toContainElement` (jest-dom) no está registrado, usa `contains`. `CSS.escape` puede no existir. Las páginas completas tardan más de 5 s en montar: usa `vi.setConfig({ testTimeout: 20000 })` en el spec. Los timeouts sueltos de la suite completa se repiten aislados.
- **Specs que leen código como texto:** `?raw` funciona con `.ts`/`.tsx`, pero vitest vacía los `.css` (`""`) salvo los listados en `test.css.include` (`vitest.config.ts`, añadido en UX-02 para `index.css`). Todo spec así empieza con una aserción de cordura (texto no vacío y una marca conocida): sin ella, la fase roja de UX-02 fue un falso rojo. No uses `node:fs` en specs de web: `tsc` revisa `src` entero y `apps/web` no tiene `@types/node`.
- **Clases de un `svg` en jsdom:** `svg.className` es un `SVGAnimatedString`; lee las clases con `getAttribute('class')`.
- **Radix DropdownMenu en tests:** ábrelo con teclado (`ArrowDown`).
- **Enlace extendido en tarjetas:** todo contenedor o icono decorativo que quede por encima lleva `pointer-events-none`, y los controles reales `pointer-events-auto`.
- **Datos sensibles:** nunca en `title`. Usa un disclosure plegado sin el texto en el DOM (`ChipSaludAlumno`).
- **Recargas:**
  - no tapan la pantalla ni pisan lo que se edita (refs + `formularioModificado`);
  - un contador de generación descarta respuestas antiguas;
  - los fallos de carga van por su propio canal (`avisoCarga`), separado de los de guardado.
- **"Sin datos" no es "falló la carga":** una respuesta 204 vacía es "sin datos", y un error ofrece Reintentar.
- **Reportes del agente externo:** contrasta siempre con `ls` y `wc`. Ya hubo uno que dijo "no modifiqué archivos" y había ampliado un spec, y otro que dio mal el número de líneas.
- **Engram:** puede fallar con "multiple active runtime sessions". Avisa y sigue.

## Estado al 2026-10-28
- **Fundaciones de la auditoría UX cerradas (2026-10-29):** UX-01 `8cc2a89`, UX-02 `a670b4b`, UX-03 `e071bf4`, UX-04 `d482f4f` (con sus `docs(vault)`).
- **UX-05 cerrado (2026-10-29, `d777772`):** Conciliación y Cartera con estados honestos.
- **UX-06 cerrado (2026-10-29, `87fe4df`):** rechazo seguro y `useFormatoNumero()`.
- **UX-07a cerrado (2026-10-29, `bc64170`):** Conciliación táctil y sin jerga. Web **2594/2594**.
- **D3 resuelta:** "Registrar cobro" más menú "Más acciones" en el móvil; 36px en escritorio desde `md`.
- El siguiente lote es **UX-07b** (Cartera: COB-19 a 25 más el lote web P2, el próximo vencimiento). Seguimientos de copy de Conciliación para UX-10 en la auditoría. Los seguimientos de cada lote están en la sección 3 de la auditoría. UX-07 suma el lote web P2 del módulo 5.
- Rediseño de la ficha del alumno (`/coach/alumnos/:id`) CERRADO:

  | Lote | Commit |
  |---|---|
  | L1–L3 | `ad1788f` |
  | L4 | `8b4504a` |
  | L5 | `f22ba4c` |
  | L6 | `3535cde` |
  | L7 | `b6c2dc2` |
  | Docs | `541254e` |

  Detalle en RF-011, RF-012 y `06_Guia_Pruebas_Manuales.md` §5.
- "Mis alumnos" (`/coach/alumnos`) cerrado (lotes de octubre, `26917bb` … `fd4cd63`).
- Pendientes de la ficha anotados en RF-011, no decididos:
  - el borrador de "Plan y tarifa" se pisa en la recarga;
  - paralelizar la carga inicial;
  - fusionar los KPI de Pagos;
  - unificar las dos zonas horarias: `perfiles_alumno.zonaHoraria` frente a `usuarios.timezone`, decisión de API.
- Módulo 5 (Pagos y cartera) sigue PAUSADO desde el 2026-10-12. Sus pendientes:
  - web de la anulación de cuotas;
  - congelar la membresía;
  - condonar el resto de una cuota;
  - zona horaria del alumno al activar la cuenta;
  - PagosPage;
  - lote P2 de Control de Cobros;
  - seguimientos de RNF-002.

  Varios coinciden con los lotes UX de Cobros (UX-05…10) y de Pago del alumno (UX-21/22): al llegar ahí, revisa si conviene juntarlos.
- Tests base: web **2427/2427**. API ~2015 (1 omitido; e2e con `E2E_DATABASE_URL`).

## Piezas a reutilizar (de la ficha y de "Mis alumnos")
- **`components/ui/`:** `BotonTactil` (variantes `primaria`, `secundaria`, `peligro`, `peligro-contorno`; no sobrescribas su color con `className`), `BadgeEstado` (`whitespace-nowrap shrink-0`), `BarraTabsSegmentada` (UX-01, `8cc2a89`; seguimientos en la auditoría, sección 3), `BotonTactil`, `ChipFiltro`, `EstadoCarga`, `EstadoError`, `EstadoVacio`.
- **`components/common/`:** `AvisoErrorRecarga` (UX-05: recarga fallida con datos visibles; solo con conexión), `Paginacion` (+ `lib/use-paginacion-servidor`), `AvisoDatosOffline` (+ `lib/use-frescura-offline`), `DialogoConfirmacion`, `ZonaHorariaPerfil`.
- **`components/entrenador/alumno-detalle/`:** `PestanasFichaAlumno` (fuente de `BarraTabsSegmentada`), `MenuAccionesAlumno` (Radix DropdownMenu), `ChipSaludAlumno`, `FranjaDatosClaveAlumno` (+ `lib/datos-clave-alumno.ts`), `SeccionZonaHorariaAlumno`, el patrón `<details>` de `PestanaAntropometriaAlumno` y el aviso "Cambios sin guardar" de `PestanaResumenAlumno`.
- **`components/layout/`:** `MenuCuenta` (Radix, correo y rol con `etiquetaRol`) y `BotonesSincronizacion` (UX-04, `d482f4f`).
- **`components/ajustes/CampoAjustes.tsx`:** `CampoAjustes` (sufijo, descripción, `inputMode` decimal) y `SelectAjustes` (UX-03, `e071bf4`).
- **`lib/`:** `formato-monto` (`formatMonto`, `formatDecimal`; formato venezolano por defecto) y `use-formato-numero` (`useFormatoNumero()`, la única vía de las vistas, §6.17), `use-tabs-accesibles`, `use-dialogo-accesible`, `etiquetas-dominio`, `date-format`, `alumnos-directorio-actividad` (`describirUltimoEntreno`), `alumno-detalle-metricas` (`resolverUltimoEntrenamiento`, `esSesionRealizada`).

Empieza revisando la memoria (`mem_search "guachafit auditoría UX"` y `"ficha del alumno"`). Lee 00_Inbox/Auditoria_UX_Vistas_2026-10-28.md (secciones 2, 3 y 4) y propón arrancar con UX-01, con sus contratos de tests en fase roja.
```

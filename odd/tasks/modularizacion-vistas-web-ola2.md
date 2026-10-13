# Feature: modularizacion-vistas-web-ola2 (archivos de 700 a 999 líneas)

## Objetivo
Partir en componentes atómicos los 6 archivos de la Ola 2 y cerrar el BLOCKER-51-1 (editor de rutina duplicado entre la ficha del alumno y `BloquesRutinaEditor`), con las mismas reglas de la Ola 1 y sin cambiar el comportamiento observable.

## Reglas
Son vinculantes, sin repetirlas aquí:
- R1–R9 de `odd/tasks/modularizacion-vistas-web.md`.
- [[ADR-022-estructura-componentes-atomicos-web]].
- §6, regla 14, de `00_Reglas_Desarrollo_SDD.md`.

Ajustes aprendidos en la Ola 1:
- **R10. Un prompt por módulo de punta a punta:** inventario → caracterización (si falta red) → extracción por sub-lotes → revisión. Los átomos de `components/ui/` ya existen, así que no hace falta una fase de consolidación previa: lo que se repita entre módulos se marca como CANDIDATO y se resuelve en el cierre.
- **R11. Componentes que no son páginas:** si el archivo es un componente (no una página), el archivo original se queda en su ruta con el mismo export y la misma API de props, y pasa a ser el contenedor (≤ 300 líneas). Sus piezas van en `components/entrenador/<modulo>/`. Los archivos que lo importan no se tocan.
- **R12. Specs siempre con `--testTimeout=20000`**, uno por uno. La base vale con 3 corridas en verde seguidas. Un test inestable solo se acepta si pasa 3/3 ejecutado solo.
- **R13. Reportes por partes:** se escriben sección a sección y al final se comprueba con `wc -l` y con la lectura de la cola que terminan en la última sección.
- **R14. Sin herramienta de subagentes:** si el runtime no la tiene, se declara en el reporte y la revisión se hace en una pasada separada al final, sin reutilizar conclusiones.
- **R15. Guardián en paralelo:** al bajar de 400 líneas, `tamano-archivos.spec.ts` fallará por "excepción que ya no hace falta". Ese rojo es ESPERADO durante la fase de módulos y no se toca (el archivo es compartido). Las entradas se retiran en el cierre.

## Inventario (medido 2026-10-13, base `bdcfde0`)

| # | Módulo (carpeta de reportes) | Archivo | Líneas | Red de tests actual | Lo importan |
|---|---|---|---|---|---|
| N1 | `panel-nutricion-alumno` | `apps/web/src/components/entrenador/PanelNutricionAlumno.tsx` | 977 | `PanelNutricionAlumno.spec.ts` (no de interacción) | `AlumnoDetallePage.tsx` |
| N2 | `selector-plantilla-asignacion` | `apps/web/src/components/entrenador/SelectorPlantillaAsignacion.tsx` | 948 | `SelectorPlantillaAsignacion.interaccion.spec.tsx` | `AlumnoDetallePage.tsx` |
| N3 | `monitor-adherencia` | `apps/web/src/pages/entrenador/MonitorAdherenciaPage.tsx` | 888 | **ninguna** | `router.tsx` |
| N4 | `cartera` | `apps/web/src/pages/entrenador/CarteraPage.tsx` | 864 | 4 specs de interacción | `router.tsx` |
| N5 | `bloques-rutina-editor` | `apps/web/src/components/entrenador/BloquesRutinaEditor.tsx` | 830 | **ninguna real** (`PlantillasPage.caracterizacion` lo sustituye por un stub, W50-2) | `ModalPlantilla.tsx`, `use-plantillas-banco.ts` |
| N6 | `conciliacion` | `apps/web/src/pages/entrenador/ConciliacionPage.tsx` | 772 | 2 specs de interacción | `router.tsx` |

## Fases

| Fase | Prompt(s) | Paralelo | Salida |
|---|---|---|---|
| **M. Módulos** | `70`–`75` (uno por módulo, R10) | Sí, los 6 | `.opencode-prompts/reportes/<modulo>/7x-<modulo>-validacion.reporte.md` |
| **E. Convergencia del editor** (BLOCKER-51-1) | `76` | No (después de `74`) | `reportes/convergencia-editor/` |
| **D. Cierre** | `77` | No | Retira las entradas de la Ola 2 del guardián, promueve candidatos, verificación global → `reportes/cierre-ola2/` |

## Superficie
- **Módulo X:** su archivo, `components/entrenador/<modulo>/**`, `lib/<modulo>-*.ts` nuevos y specs nuevos de caracterización (`<Archivo>.caracterizacion.interaccion.spec.tsx` junto al original) o de lógica pura. Importa, sin editarlos, `ui/`, `common/`, `lib/` existentes y `@guachafit/shared`.
- **Convergencia (76):** `components/entrenador/alumno-detalle/{ModalRutinaSemanal,ContenidoRutinaSemanal,CatalogoEjerciciosRutina,use-rutina-alumno}.*` y `components/entrenador/bloques-rutina-editor/**`.
- **Cierre (77):** `tamano-archivos.spec.ts` (retirar las entradas de la Ola 2) y la promoción de candidatos.
- **Siempre prohibido:** editar specs existentes, `.env`, commit, push, dependencias nuevas, `apps/api`, `packages/*` y `router.tsx`.

## Checklist
- [x] M: prompts `70`–`75`. Commits `428ac00`..`17f8cbc`.
- [ ] E: prompt `76` (convergencia del editor o decisión documentada de mantener la duplicación).
- [ ] D: prompt `77`.
- [ ] Claude: verificación contra el diff, un commit por módulo, `docs(vault)` y limpieza.

## Criterios de aceptación
- Los 6 archivos quedan ≤ 300 líneas como contenedores, y ninguna pieza nueva pasa de 400.
- Los specs existentes no se editan y mantienen su conteo en verde. Los specs de caracterización nuevos pasan en verde sobre el código previo al refactor.
- `EXCEPCIONES_OLA2_NO_TRABAJADA` queda vacía y el guardián en verde.
- Typecheck y build en verde.
- BLOCKER-51-1 resuelto (un solo editor) o cerrado con una decisión explícita y evidencia.

## Progreso
- 2026-10-13: ODD creado, archivos medidos y prompts `70`–`77` redactados.
- 2026-10-13 (Claude): fase M verificada contra el diff. Archivos: 977 → 246, 948 → 177, 888 → 122, 864 → 195, 830 → 174 y 772 → 112. Ninguna pieza nueva pasa de 289 líneas. Solo se tocó la superficie propia, sin editar specs existentes. Se crearon 9 specs de caracterización y 7 de lógica pura. Commit por módulo. El guardián queda en rojo esperado (R15) hasta el `77`.

## Siguiente paso
- Prompt `76` (convergencia del editor), solo.

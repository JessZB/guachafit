# Feature: modularizacion-vistas-web-ola3 (archivos de 401 a 699 líneas)

## Objetivo
Dejar por debajo del tope de 400 líneas los 8 archivos que aún exceptúa el guardián (`EXCEPCIONES_OLA3_NO_TRABAJADA`), partiéndolos en componentes atómicos sin cambiar el comportamiento observable, y cerrar con el guardián sin excepciones.

## Reglas
Son vinculantes, sin repetirlas:
- R1–R9 de `odd/tasks/modularizacion-vistas-web.md`.
- R10–R15 de `odd/tasks/modularizacion-vistas-web-ola2.md`.
- [[ADR-022-estructura-componentes-atomicos-web]].
- §6, regla 14.

Ajuste propio de esta ola:
- **R16. Carpeta de piezas según el tipo de archivo:**
  - Componente: las piezas van junto a él, en `<carpeta del componente>/<modulo>/`. Por ejemplo, `components/common/grafico-evolucion/`.
  - Página `pages/<rol>/X`: las piezas van en `components/<rol>/<modulo>/`.
  - `GraficoEvolucion` está en `common/`, así que sus piezas siguen siendo compartidas: no se marcan como ÚNICAS de una vista.

## Inventario (medido 2026-10-13, base `8092a92`)

| # | Módulo (carpeta de reportes) | Archivo | Líneas | Red de tests actual | Lo importan |
|---|---|---|---|---|---|
| T1 | `antropometria` | `apps/web/src/pages/entrenador/AntropometriaPage.tsx` | 638 | **ninguna** | `router.tsx` |
| T2 | `admin` | `apps/web/src/pages/admin/AdminPage.tsx` | 585 | **ninguna** | `router.tsx` |
| T3 | `grafico-evolucion` | `apps/web/src/components/common/GraficoEvolucion.tsx` | 559 | **ninguna** | `PestanaAntropometriaAlumno.tsx`, `ProgresoPage.tsx` |
| T4 | `asignacion-masiva-plantilla` | `apps/web/src/components/entrenador/AsignacionMasivaPlantilla.tsx` | 543 | **ninguna** | `PlantillasPage.tsx` |
| T5 | `matriz-preferencias-notificacion` | `apps/web/src/components/notificaciones/MatrizPreferenciasNotificacion.tsx` | 466 | `MatrizPreferenciasNotificacion.interaccion.spec.tsx` | `PestanaNotificaciones.tsx`, `AjustesAlumnoPage.tsx` |
| T6 | `tabla-cartera` | `apps/web/src/components/entrenador/TablaCartera.tsx` | 459 | `TablaCartera.spec.ts` (no de interacción) | `CarteraPage.tsx` |
| T7 | `onboarding` | `apps/web/src/pages/auth/OnboardingPage.tsx` | 432 | **ninguna** | `router.tsx` |
| T8 | `detalle-sesion-entrenamiento` | `apps/web/src/components/entrenador/DetalleSesionEntrenamiento.tsx` | 412 | `DetalleSesionEntrenamiento.spec.ts` (no de interacción) | `HistorialSesionesAlumno.tsx`, `ModalActividadAlumno.tsx` |

Objetivo de tamaño: contenedor ≤ 300 y piezas ≤ 250. En los archivos más pequeños (T7, T8) basta con extraer 2 o 3 piezas: no se fragmenta por fragmentar (R3).

## Fases

| Fase | Prompt(s) | Paralelo | Salida |
|---|---|---|---|
| **M. Módulos** | `80`–`87` | Sí, los 8 | `.opencode-prompts/reportes/<modulo>/8x-<modulo>-validacion.reporte.md` |
| **D. Cierre** | `88` | No | `EXCEPCIONES_OLA3_NO_TRABAJADA` vacía, candidatos, verificación global → `reportes/cierre-ola3/` |

## Checklist
- [ ] M: prompts `80`–`87`.
- [ ] D: prompt `88`.
- [ ] Claude: verificación contra el diff, un commit por módulo, `docs(vault)` y limpieza.

## Criterios de aceptación
- Los 8 archivos quedan en ≤ 300 líneas, y ninguna pieza nueva pasa de 400.
- Los specs existentes no se editan y mantienen su conteo en verde. Los de caracterización nuevos pasan en verde sobre el código previo.
- Las dos listas de excepciones del guardián quedan vacías y el guardián, en verde.
- Typecheck y build en verde.

## Progreso
- 2026-10-13: ODD creado, archivos medidos y prompts `80`–`88` redactados.

## Siguiente paso
- El dueño lanza en paralelo los prompts `80`–`87`.

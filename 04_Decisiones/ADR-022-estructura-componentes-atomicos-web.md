---
id: ADR-022
titulo: "ADR-022: Estructura de componentes atómicos web (ui/ + common/ + vista)"
fecha: 2026-10-12
estado: aceptado
fecha_verificacion: 2026-10-13
decisores:
  - "Dueño del producto"
  - "Tech Lead"
tags:
  - decision
  - adr
  - frontend
  - ux
  - arquitectura
---

# ADR-022: Estructura de componentes atómicos web (ui/ + common/ + vista)

## 1. Estado
`aceptado` (2026-10-13). Fue un borrador de la fase C del ODD `odd/tasks/modularizacion-vistas-web.md` (prompt 48) y se aceptó al cerrar el ODD. Lo aplican las 8 vistas de la Ola 1 y lo vigila `apps/web/src/tamano-archivos.spec.ts`.

---

## 2. Contexto y Fuerzas en Juego
Ocho vistas de `apps/web` superan las 1000 líneas (medido 2026-10-12, `wc -l`, sin specs):

| Vista | Líneas |
|---|---|
| `AlumnoDetallePage.tsx` | 5016 |
| `EntrenamientoPage.tsx` | 2950 |
| `AlumnosPage.tsx` | 1306 |
| `PagosPage.tsx` | 1254 |
| `ProgresoPage.tsx` | 1188 |
| `NutricionPage.tsx` | 1175 |
| `AjustesPage.tsx` | 1098 |
| `PlantillasPage.tsx` | 1023 |

La fase A (inventarios 40–47) verificó que cada vista reescribe las mismas piezas:
el spinner de carga en ≥6 vistas, el error con "Reintentar" en ≥10, la tarjeta vacía
`border-dashed` en 20+ sitios, 5 mapas tono→clases idénticos, chips de filtro con clases
idénticas (`PagosPage.tsx:998-1009` ↔ `ConciliacionPage.tsx:355-364`) y el botón primario
de 44px en 4+ superficies. Cada copia reaplica a mano las reglas de §6 (44px, 11px, AA,
pesos ≤ 700, estados honestos) y varias copias ya incumplen el área táctil
(`py-1.5`/`py-2.5` en chips y reintentos).

A la vez, tres restricciones limitan la consolidación: R5 prohíbe editar specs y cambiar
comportamiento observable; R9 prohíbe introducir TanStack Query en las vistas que montan
sin `QueryClientProvider` (M1, M4, M5, M6, M8); R3 prohíbe generalizar por especulación.

---

## 3. Decisión
Se adopta la estructura de capas R1–R8 del ODD como convención permanente del front:

1. **Átomo** (`components/ui/`): primitiva visual sin dominio ni datos. Los 6 átomos
   fundacionales son `EstadoCarga`, `EstadoVacio`, `EstadoError` (estados honestos de
   §6.6), `BotonTactil`, `BadgeEstado` y `ChipFiltro`. Cada átomo cumple §6 por
   construcción (44px, 11px mínimo, tokens con variante claro/oscuro, pesos ≤ 700) y
   lleva su spec de interacción en verde. Ningún átomo exige `QueryClientProvider`.
2. **Compartido** (`components/common/` o `components/<dominio>/`): pieza de dominio
   transversal usada en 2+ vistas con duplicación verificable (`archivo:línea` en ambas
   copias). Se promueve solo con sustitución mecánica y specs verdes antes y después.
3. **Único de vista** (`components/<rol>/<modulo>/`): todo lo demás. Ante la duda se
   marca único y se anota como candidato (R3); la promoción la decide la consolidación,
   nunca la extracción.
4. **Topes R2**: página ≤ 300, componente ≤ 250 (duro 400 con justificación escrita),
   hook/lib ≤ 250, una responsabilidad por archivo.
5. **Contratos R4**: los tipos de dominio vienen de `@guachafit/shared`; nombres en
   español; §6 vigente en cada componente nuevo.

---

## 4. Consecuencias
- **Positivas:** §6 se cumple una vez en el átomo y no en cada copia; los átomos nacen
  corrigiendo los incumplimientos medidos (`role="status"`/`role="alert"` que faltaban,
  `aria-pressed` en chips, `min-h-11` en botones y reintentos); las fases B consumen los
  átomos en lugar de duplicarlos.
- **Costes y límites:** `ChipFiltro` impone `min-h-11` donde las copias usaban `py-1.5`:
  la fase B lo adopta a conciencia (los specs consultan por rol y nombre, no por alto).
  `EstadoError` impone `role="alert"` y `EstadoCarga` `role="status"`: mejora accesible
  solo para consumidores nuevos, sin tocar páginas existentes. Las promociones a
  `common/` que exigen sustitución en páginas quedan como guía para B/D (en paralelo con
  B0 no se tocan páginas). `components/ui/` no admite lógica de datos ni providers.
- **Implementación:** `apps/web/src/components/ui/` (6 átomos + 6 specs, 22 tests),
  reporte `.opencode-prompts/reportes/consolidacion/48-consolidacion-validacion.reporte.md`.
- **Ampliación (2026-10-28, `8cc2a89`, lote UX-01):** séptimo átomo `BarraTabsSegmentada`,
  control segmentado de pestañas sin scroll horizontal (2–6 columnas por mapa fijo de
  clases literales, porque Tailwind v4 no genera clases dinámicas). Recibe las props APG
  de `lib/use-tabs-accesibles` y no conoce el dominio. Primer consumidor:
  `PestanasFichaAlumno`. Siguientes: Ajustes (UX-17), Cartera (UX-07) y Antropometría (UX-15).

---

## 5. Alternativas consideradas
- **Consolidar también la capa de modal (`CapaModal`/`ModalBase`) en esta fase:**
  descartada. El overlay ya vive consolidado en `DialogoConfirmacion` (foco, Escape,
  restore); un átomo de overlay desnudo invita a regresiones de accesibilidad. Solo se
  retoma si la fase D demuestra una necesidad no dialógica.
- **Extender `MetricCard` con variante interactiva/compacta (KPIs de Alumnos, métricas
  de Entrenamiento, tiles de Progreso):** descartada en C. Las 3 formas difieren
  (`p-5` con icono vs botón-filtro vs chip `p-3`); unificarlas a la fuerza es
  generalizar por especulación (R3). Queda como candidato de D.
- **Crear los 3 editores de rutina como piezas comunes nuevas:** descartada. El editor
  ya existe y funciona (`BloquesRutinaEditor`, usado por Plantillas); la fase B de M1
  lo consume en lugar de duplicarlo (hallazgo W-3 del inventario 40).
- **Migrar las vistas a `usePaginacionServidor` (TanStack) dentro de este ODD:**
  descartada por R9/BLOCKER B-2: rompería los specs que montan sin `QueryClientProvider`.
  Queda para un ODD posterior con specs nuevos.
- **No crear `ui/` y dejar cada copia en su vista:** descartada porque perpetúa las
  20+ copias del vacío y los incumplimientos táctiles ya medidos.

---

## 6. Lo aprendido en las fases B (cierre 59, sin cambiar el estado)

La fase B partió las 8 vistas con los mismos conteos de tests antes y después
(M1 99, M2 30, M3 34, M4 19, M5 9, M6 6 SSR + 9 caracterización, M7 1, M8 18)
y dejó los 8 contenedores en ≤ 300 líneas (300, 285, 225, 205, 245, 298,
258, 224). Ningún archivo nuevo pasa de 400; las desviaciones R2 quedan
justificadas por escrito en el reporte 51 (4 hooks de M1 entre 260 y 374
líneas y `ContenidoRutinaSemanal` con 397: recortes verbatim de secuencias
atómicas que partir más fragmentaría).

- **R3 confirmado en la práctica:** ante la duda, único. La mayoría de los
  CANDIDATOS de dos módulos resultaron no sustituibles de forma mecánica
  (markup, colores o contratos de props distintos por rol: semáforo/badge
  M1↔M3, fila de transacción M1↔M4, subida de comprobante M4↔M6, tarjeta-acción
  del hub M4↔M5) y quedaron ÚNICOS con su razón en el reporte de cierre. Las
  filas 16 y 25 de la matriz ya lo preveían. Solo se promueve con sustitución
  mecánica y specs verdes antes y después.
- **R9 obligatorio:** cada hook extraído encapsula el mecanismo vigente
  (`apiClient` + `useState` + paginación manual); introducir TanStack Query
  rompe los specs que montan sin `QueryClientProvider` (BLOCKER B-2).
- **B0 previo para vistas sin specs:** M3 y M8 no se refactorizaron hasta tener
  caracterización en verde (34 y 18 tests); M1 necesitó el 60 (27 tests) para
  la pestaña entrenamiento y el modal de rutina.
- **BLOCKER-51-1 sigue abierto:** converger el editor de rutina de M1 sobre
  `BloquesRutinaEditor` rompería ~10 tests de caracterización (copys fijados
  por igualdad exacta); queda como recorte verbatim para la fase D (unificar
  copy) o un ODD posterior.
- **Deuda fuera del ODD:** el guardián `tamano-archivos.spec.ts` señala 8
  archivos preexistentes de más de 400 líneas que no son M1–M8 ni Ola 2
  (`AntropometriaPage`, `AdminPage`, `GraficoEvolucion`, `AsignacionMasivaPlantilla`,
  `MatrizPreferenciasNotificacion`, `TablaCartera`, `OnboardingPage`,
  `DetalleSesionEntrenamiento`); ver BLOCKER-59-1 en el reporte de cierre.

---
id: ADR-022
titulo: "ADR-022: Estructura de componentes atómicos web (ui/ + common/ + vista)"
fecha: 2026-10-12
estado: propuesto
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
`propuesto` (borrador de la fase C del ODD `odd/tasks/modularizacion-vistas-web.md`, prompt 48).

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

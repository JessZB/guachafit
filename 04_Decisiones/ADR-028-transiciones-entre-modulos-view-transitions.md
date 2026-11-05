---
id: ADR-028
titulo: "ADR-028: Transiciones entre módulos con View Transitions como mejora progresiva y entrada unificada en el layout"
fecha: 2026-11-05
estado: implementado
decisores:
  - "Dueño del producto"
  - "Tech Lead"
tags:
  - decision
  - adr
  - arquitectura
  - frontend
  - ux
  - animaciones
---

# ADR-028: Transiciones entre módulos con View Transitions como mejora progresiva y entrada unificada en el layout

## 1. Estado
`implementado` en `4147202` (2026-11-05), fase 1 de un plan de cuatro fases (ver §8). Continúa la línea de [[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]] §8–§11 (animaciones de modales y entrada global).

## 2. Contexto
- Auditoría del 2026-11-05 sobre las vistas de admin, alumno y entrenador: la barra inferior, la cabecera y el menú lateral persisten entre rutas, pero **la página se remonta** en cada cambio. 12 de 18 vistas hacían un fundido propio de 200–300 ms en su raíz y 6 aparecían de golpe (Entrenamiento, Nutrición, Dashboard, Cartera, Conciliación, Antropometría); el `animate-fade-in` del `<main>` solo corría al montar el layout, no al cambiar de ruta.
- El scroll no se reiniciaba al cambiar de módulo y no existía ninguna View Transition en el código (react-router 7 las soporta con la opción `viewTransition` de `Link`, `NavLink` y `navigate`).
- Restricciones: el bloque `@media (prefers-reduced-motion: reduce)` de `index.css` debe seguir siendo único y último (guardián `estilo-movimiento-reducido.spec.ts`); los modales `fixed inset-0` cuelgan dentro de las páginas y no deben quedar confinados por un `transform` ([[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]] §9).

## 3. Decisión
- **Mejora progresiva con la View Transitions API.** `useTransicionVista()` (`lib/use-transicion-vista.ts`) vale `true` solo si el navegador expone `document.startViewTransition` y la persona no pidió movimiento reducido (`lib/movimiento-reducido.ts`, compartido con `useSalidaModal`). Su valor se pasa como `viewTransition` a los `Link`/`NavLink`/`navigate` de navegación interna (barra inferior, menú lateral, menú de cuenta, tarjetas de menú, dashboard, directorio y ficha del alumno). Los enlaces de autenticación y los externos no lo usan.
- **Solo el contenido se funde.** `Header`, `BottomNav` y `Sidebar` llevan su propio `view-transition-name` (`cabecera`, `barra-inferior`, `menu-lateral`) y quedan fijos; el contenido cuelga de un único nodo `contenido`. La capa `root` no se anima (`animation: none`).
- **Una sola fuente de entrada.** `EntradaVista` (`components/layout/EntradaVista.tsx`) envuelve `Suspense`+`Outlet` con `key = pathname` y el nombre `contenido`. Con View Transitions la animación la definen las reglas de `index.css` (salida de 120 ms, entrada de 200 ms con opacidad y un ascenso de 6 px); **sin soporte, o con movimiento reducido, se usa el fundido de respaldo `animate-fade-in`** (solo opacidad). Las raíces de 10 páginas dejaron de animarse por su cuenta (`AdminPage`, `PagosPage`, `ProgresoPage`, `AlumnoDetallePage`, `AlumnosPage`, `PlantillasPage`, `MonitorAdherenciaPage`, `AtletaMenuPage`, `CoachMenuPage`, `PantallaAjustes`); un guardián impide que vuelvan a llevar `animate-in` o `animate-fade-in`.
- **Scroll al inicio** al cambiar `pathname` (`window.scrollTo` y `main.scrollTop`; en este layout scrolla la ventana, no el `<main>`).
- **Movimiento reducido:** las reglas `::view-transition-*` viven en `@media (prefers-reduced-motion: no-preference)` (bloque nuevo, antes del bloque `reduce` que no se tocó) y, además, el guarda de JavaScript evita llamar a `startViewTransition`. Los pseudo-elementos `::view-transition-*` no los cubre la regla global `*`, de ahí la doble defensa.

## 4. Alternativas descartadas
- **Animar con CSS por página (`animate-in`):** transform que confina modales `fixed` y entrada duplicada con el fundido de la transición.
- **Quitar el chrome del fundido sin nombrarlo:** la cabecera sticky y la barra fija parpadean al fundirse en el snapshot de `root`.
- **Mover la regla de movimiento reducido al bloque global:** exige cambiar el guardián y no cubre los pseudo-elementos de todos modos.
- **Hacer scroll solo en `main`:** hoy no es el contenedor de scroll.

## 5. Consecuencias
- Navegar entre módulos funde el contenido sin tocar la cabecera ni las barras; Safari anterior a 18 y otros navegadores sin soporte siguen con el fundido de respaldo.
- El cambio de ruta remonta el contenido (ya ocurría); cambiar solo de parámetro (`/coach/alumnos/:id`) también lo remonta.
- Lo cargado con spinner (14 vistas) **sigue mostrando su indicador** tras la transición: es el objeto de la fase 2.

## 6. Límites (revisión de fiabilidad: 0 BLOCKER, 0 WARNING, 3 SUGGESTION)
- **Atrás/adelante del navegador** vuelve siempre al inicio de la página (el reinicio de scroll no distingue historial).
- **Foco y anuncio:** al navegar con la barra el foco se queda en el enlace pulsado y no se anuncia el cambio de vista a un lector de pantalla.
- **Sub-vistas internas** de `PagosPage` y `ProgresoPage` (hub ↔ nuevo reporte) perdieron su fundido propio; hoy cambian de golpe.
- No se verificó a ojo durante la transición si la cabecera y la barra inferior parpadean; se midió solo el resultado final.

## 7. Evidencia
Lote 112/112 y suite web completa **3.612/3.612**; typecheck y build en 0. Probado en Chrome: cada navegación dispara exactamente una `startViewTransition`, el scroll vuelve a 0 desde `scrollY` 237, y los modales `fixed inset-0` siguen midiendo toda la ventana (0,0,ancho,alto) aunque cuelguen de un nodo con `view-transition-name` (no hay confinamiento). El único spec existente editado (`modales-salida-animada.spec.ts`) invirtió su aserción a propósito: las 7 páginas ya no deben contener `animate-fade-in`.

## 8. Plan de fases
1. **Transiciones entre módulos** (este ADR).
2. Carga sin saltos: primitiva `Skeleton` compartida, skeletons con la forma de cada vista y retraso del indicador para no parpadear.
3. Botones: estado «cargando» en `BotonTactil`, `focus-visible` global y los 5 botones de envío sin spinner.
4. Menús y desplegables sin salida animada (menú de cuenta, selector de tamaño de página, menús de acciones).

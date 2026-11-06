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
2. ✅ Carga sin saltos (§9): primitiva `Skeleton` compartida, esqueletos con la forma de cada vista y retraso del indicador de 150 ms. La ronda 2b cerró el fallback de rutas y las metas de Nutrición (§9.5).
3. ✅ Botones (§10): estado «cargando» en `BotonTactil`, `focus-visible` y transición globales y los 5 botones de envío con spinner.
4. ✅ Menús y desplegables con salida animada (§10): menú de cuenta, selector de tamaño de página, menús de acciones y panel del catálogo.

## 9. Addendum 2026-11-05: fase 2, carga sin saltos (esqueletos)

### 9.1. Decisión
- **Primitivas** (`components/ui`): `Skeleton` (bloque `aria-hidden` con `animate-pulse`), presets en `esqueletos.tsx` (`EsqueletoTarjetasKpi`, `EsqueletoListaFilas`, `EsqueletoRejillaTarjetas`, `EsqueletoFormulario`, `EsqueletoCabeceraPestanas`; cada uno con `data-esqueleto` y `data-esqueleto-bloque`) y `CargaConEsqueleto`.
- **`CargaConEsqueleto`** expone **de inmediato** `role="status"` + `aria-busy` + el texto de carga en `sr-only` (lectores de pantalla y specs existentes) y dibuja el esqueleto visual solo tras **150 ms** de carga continua (`useIndicadorRetrasado`): las cargas rápidas no parpadean.
- **13 vistas** sustituyen su `EstadoCarga` por esqueletos a su medida y con el mismo texto de carga: Entrenamiento, Progreso, Pagos, Dashboard (la franja de atención sigue visible y el esqueleto va debajo), Conciliación, Ficha de alumno, Plantillas, Antropometría, Monitor de adherencia, Ajustes del entrenador (planes y tasa), Ajustes (perfil y seguridad) y zona horaria del alumno.
- **Nutrición:** `use-reporte-hoy` expone `cargandoReporte` y el cuerpo del formulario se sustituye por un esqueleto hasta que llega el reporte de hoy; el formulario aparece ya rehidratado y no se puede guardar antes de saber si ya existe un reporte.
- No cambian `CarteraPage` y `AlumnosPage` (ya tenían esqueleto), `CoachMenuPage` (el saludo solo cambia de ancho) ni el fallback de rutas de `AppLayout` (ver §9.3).

### 9.2. Alternativas descartadas
- Ocultar el texto de carga hasta los 150 ms: rompería los specs y dejaría a los lectores de pantalla sin anuncio.
- Migrar los 14 hooks de carga propios a react-query para conservar lo cargado: fuera de alcance; solo 4 vistas usan caché.
- Una altura fija por esqueleto en lugar de `min-h`: el contenido real varía.

### 9.3. Límites y seguimiento
- ~~**Fallback de rutas** (`AppLayout`, `Suspense`) con spinner~~: resuelto en la ronda 2b (§9.5).
- ~~**Sección de metas de Nutrición** con `EstadoCarga`~~: resuelto en la ronda 2b (§9.5). Mientras carga siguen existiendo dos regiones `role="status"` (reporte y metas), cada una con su texto.
- **Nutrición** midió un salto de layout de 0,076 al cargar (reserva de alto del esqueleto frente al formulario real).
- Sugerencias de la revisión: doble región de estado en Nutrición, contraste sutil del esqueleto en modo oscuro y anuncio de un `role="status"` estático en lectores de pantalla.

### 9.4. Evidencia
Lote 112/112 y suite web completa **3.700/3.700**; typecheck y build en 0. Revisión de fiabilidad: 0 BLOCKER, 0 WARNING, 3 SUGGESTION. Cinco specs previos solo cambiaron el nombre del componente o ganaron esperas (`EstadosMonitor.estructura`, `NutricionPage.caracterizacion`, `NutricionPage.spec` con el hook mockeado, `ProgresoPage.ux27.carga` y `.url`). Probado en Chrome con la red del API retrasada 1,5 s: los esqueletos del Panel, la ficha de alumno, Pagos y Nutrición aparecen tras 150 ms, sin spinner de vista, y el salto de layout medido fue 0 en casi todas (0,0003 a 0,0006 en dos; 0,076 en Nutrición). En la primera visita de cada módulo se vio el spinner del fallback de rutas, que es el pendiente de §9.3.

### 9.5. Ronda 2b (2026-11-05): fallback de rutas y metas de Nutrición
- Preset `EsqueletoPagina` (título, subtítulo y tres tarjetas) para el `Suspense` de `AppLayout`: en la primera visita a cada módulo (carga del código de la ruta) el texto «Cargando contenido…» sigue disponible de inmediato y a los 150 ms aparece el esqueleto de página en lugar del spinner. Misma reserva de alto (`min-h-[50vh]`).
- `SeccionMetasNutricionales` usa `CargaConEsqueleto` («Cargando tus metas…», `min-h-[300px]`, tres tarjetas KPI) en lugar de `EstadoCarga`.
- Evidencia: lote 220/220 y suite web completa **3.713/3.713**; typecheck y build en 0; un spec previo (`NutricionPage.ux23`) solo ganó esperas. No se auditó si queda algún otro spinner de carga de vista fuera de las 13 vistas migradas (por ejemplo, el `PublicFallback` del router público o spinners de secciones menores).
- Pendiente: el salto de layout de 0,076 medido en Nutrición (reserva de alto del esqueleto frente al formulario real) y el contraste del esqueleto en modo oscuro; ninguno de los dos se midió con instrumentos en dispositivo.

## 10. Addendum 2026-11-05: fases 3 y 4 (botones con estado de carga y menús con salida animada)

### 10.1. Decisión
- **`BotonTactil` con `cargando`:** el botón queda `disabled`, con `aria-busy="true"` y un spinner antes del contenido; no dispara `onClick`.
- **Botones de envío** de Login, Recuperar, Restablecer, Onboarding y Activación: `aria-busy`, `disabled` y spinner junto al texto de estado que ya tenían (el texto va ahora en un `<span>`). No se migraron a `BotonTactil` porque su tamaño de letra y forma cambiarían el aspecto de esas pantallas. Se conservaron los puntos suspensivos «...» de sus textos porque los specs los buscan.
- **«Reintentar»** de `ContenidoConPerfil` y `EstadoConfirmacionCorreo` pasa a `BotonTactil` (hereda transición y estado de pulsación).
- **Regla base global** en `index.css` (`@layer base`): `:focus-visible` con anillo visible en todo, transición de 150 ms en `button` y leve escala (`scale: 0.98`) al pulsar. Sustituye migrar uno a uno los 104 botones sin feedback; las utilidades de cada componente siguen mandando por capa y el movimiento reducido ya anula las duraciones. No lleva test (es visual).
- **Menús con salida animada** (`CLASES_SALIDA_POPOVER` en `lib/use-salida-modal.ts`, 100 ms): `MenuCuenta`, el selector de filas de `Paginacion`, `MenuAccionesAlumno` y `MenuAccionesFilaCartera` (Radix `DropdownMenu` controlados) y `PanelCatalogo`. Cualquier camino de cierre (Escape, clic fuera, elegir opción, el botón que abre) pasa por `cerrar`; la opción elegida se ejecuta una vez y de inmediato, y el menú no responde a más clics mientras sale. Sin `matchMedia` o con movimiento reducido el cierre es síncrono.

### 10.2. Límites
- **`PanelCatalogo`:** al enviar el creador rápido con una función asíncrona, el panel no anima su salida: el padre lo cierra como antes porque, si la creación falla, el formulario debe quedar abierto (decisión D4). Animarlo exigiría que el padre exponga el resultado del alta.
- **Radix** ignora `pointer-events-none` en `Content` (pone `pointer-events` inline): el bloqueo real durante la salida lo dan las guardas del código.
- **Escala al pulsar:** se usa la propiedad `scale` y no `transform`, para no componerse con los `active:scale-*` de las utilidades de Tailwind v4.
- **Sin verificar a ojo:** el aspecto de la regla global (anillo de foco, transición y escala en todos los botones) y las cinco salidas de menú no se vieron en un navegador en este lote.
- **Tests:** solo de comportamiento (3 specs nuevos), por decisión del dueño; sin guardianes de texto de archivos ni aserciones de clases.

### 10.3. Evidencia
Lote 623/623 y suite web completa **3.732/3.732**; typecheck y build en 0. Un spec previo (`AccionesFilaCartera.interaccion`) solo ganó la espera del desmontaje animado. Este lote no pasó por revisión de fiabilidad aparte ni por prueba en Chrome (recorte pedido por el dueño para acortar el ciclo).

## 11. Addendum 2026-11-05: la ficha del alumno carga en paralelo

### 11.1. Diagnóstico
- **Nutrición (0,076):** no se reprodujo. En Chrome, con la API retrasada entre 0,6 y 1,5 s y navegando dentro de la app, el salto de layout fue 0; una carga completa dio 0 en la repetición. Se deja sin tocar (además está por debajo del umbral de 0,1).
- **Ficha del alumno:** `cargarExpediente` (`use-expediente-alumno.ts`) hacía unas 9 peticiones encadenadas con `await` tras el perfil y `isLoading` solo bajaba al terminar la última: la espera era la suma de todas (con 1,5 s simulados por petición, ~30 s).

### 11.2. Decisión (opción A)
- El perfil sigue primero (da el `usuarioId`). Después salen en paralelo, con `Promise.allSettled`, siete tareas: transacciones, catálogo de planes, overrides → suscripción (en orden, la suscripción necesita los overrides), última sesión → historial (en orden, mismo dominio), catálogo de ejercicios, rutina activa y controles.
- `isLoading` baja en el `finally` cuando todas terminan: el esqueleto dura lo que la petición más lenta, no la suma. No cambia lo que ve el usuario ni se añaden estados de carga por pestaña.
- Alternativa descartada por ahora (B): mostrar la ficha en cuanto llega el perfil y cargar por pestaña. Se siente más rápido pero exige estados parciales y evitar el «sin registros» prematuro.

### 11.3. Límites
- El aviso de carga (`plan.notificarAvisoCarga`) es un solo texto: si fallan a la vez varias peticiones gana la que llega última (antes lo decidía el orden fijo).
- Se protegen con `vigente()` los setters propios del hook (planes, última sesión, catálogo, rutina). Los cargadores de transacciones, overrides, suscripción, historial y controles pueden seguir escribiendo estado de una carga superada, como ya ocurría (protegerlos exige tocar esos hooks).
- Los tiempos no se midieron en navegador con una sesión de entrenador: el diagnóstico de la cascada es por lectura del código y la cifra de ~30 s viene de la prueba anterior de la fase 2.

### 11.4. Evidencia
Spec nuevo de comportamiento `AlumnoDetallePage.carga-paralela.interaccion.spec.tsx` (3 tests): sin cascada tras el perfil, el estado de carga dura hasta la última petición y un fallo aislado no bloquea la ficha; falla contra el código anterior y pasa con el actual. Ficha y componentes `alumno-detalle`: 31 archivos, 280 tests en verde; typecheck en 0. No se ejecutó la suite web completa ni revisión aparte (alcance acotado por el dueño).

### 11.5. Corrección de la evidencia (2026-11-06)
- La carga en paralelo subió `use-expediente-alumno.ts` de 386 a 421 líneas y rompió el tope de 400 que vigila `tamano-archivos.spec`. No se vio en su momento porque solo se ejecutaron los specs de la ficha, no la suite web completa: lo que §11.4 llamó «sin regresiones» era una verificación parcial.
- Corregido extrayendo el bloque paralelo a `cargar-listados-expediente.ts` (154 líneas); el hook quedó en 338. Sin cambio de comportamiento. Verificación con suite web completa: **441 archivos, 3.594/3.594 tests**; typecheck y build en 0.
- Lección: un cambio en código de producción se verifica con la suite completa del paquete antes de dar el lote por bueno, aunque se acote el número de tests nuevos.

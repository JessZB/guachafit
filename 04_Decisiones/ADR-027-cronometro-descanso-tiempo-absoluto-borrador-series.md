---
id: ADR-027
titulo: "ADR-027: Cronómetro de descanso con tiempo absoluto en localStorage y borrador de series sobre la copia local existente"
fecha: 2026-11-04
estado: implementado
decisores:
  - "Dueño del producto"
  - "Tech Lead"
tags:
  - decision
  - adr
  - arquitectura
  - frontend
  - entrenamiento
  - pwa
---

# ADR-027: Cronómetro de descanso con tiempo absoluto en localStorage y borrador de series sobre la copia local existente

## 1. Estado
`implementado` en `8bcfa95` (2026-11-04). El acceso al cronómetro pasó del botón «Descanso» de la cabecera a un botón flotante el mismo día (`24d506f` y `4a84375`; ver el addendum de §8). Refina [[RF-001-checklist-entrenamiento-diario]] (RN-06, RN-07 y RN-08, §7.21) y completa el modo foco de [[ADR-021-modo-foco-entrenamiento-alumno]]. Respeta la persistencia local y la frescura offline de [[ADR-014-actualizaciones-guiadas-sw-frescura-offline]] y la regla de §7.10 de RF-001 de conservar la cola offline ante una sesión vencida.

## 2. Contexto
- El cronómetro anterior restaba un segundo por tick de un `setInterval` sobre un estado en memoria. Al recargar el estado se perdía, y con la pantalla bloqueada los ticks dejan de ejecutarse, así que el descanso se perdía o se desfasaba.
- Dos defectos reales: el cronómetro cerrado seguía sonando, y el botón «Descanso» de la cabecera (el acceso que existía entonces; hoy es el botón flotante, ver §8) abría un cronómetro «libre» cuyo «+30» reescribía el `descansoSegundos` de la última serie marcada.
- `descansoSegundos` es el **objetivo** del temporizador y no una medición ([[RF-001-checklist-entrenamiento-diario]] §7.7); no debía cambiar por efectos colaterales.
- Lo que el alumno tecleaba en una serie pendiente (peso, repeticiones, esfuerzo) ya se guardaba en la copia local de la sesión (`offlineDb.rutinaHoy`), pero al recargar se cargaba la sesión del servidor y se perdía.

## 3. Decisión
1. **Tiempo absoluto.** El estado guarda el instante de fin (`finEnMs`), no los segundos restantes. El tiempo restante se calcula contra el reloj en cada lectura, y al volver a la pestaña (`visibilitychange` y `pageshow`) se recalcula.
2. **Persistencia por sesión en `localStorage`** (`guachafit_cronometro_<sesionId>`). Sobrevive a recargas. La duración se acota a 10 s–10 min y el estado caduca a las 6 h.
3. **Un widget con pausa, reanudar, reiniciar, ±15 s y presets** de 60, 90, 120 y 180 s, en píldora y panel expandido (anillo o barra de progreso, `role="timer"`, aviso en región `aria-live`, safe-area, áreas de 44 px, foco visible). El panel dice con honestidad: «Con la pantalla bloqueada no podemos avisarte».
4. **Reglas del aviso.** Suena **una sola vez**. Cerrar detiene y borra el estado. No suena al recargar con el descanso ya vencido ni si el alumno vuelve más de 30 s después del fin: queda «terminado» en silencio. Hay un único `AudioContext` reutilizado, desbloqueado en un gesto del usuario (marcar serie, reanudar, reiniciar, preset, ±15 s). El callback `alTerminar` va aislado con `try/catch`.
5. **`descansoSegundos` sigue siendo el objetivo.** Solo cambia por una acción del alumno (±15 s o preset) sobre un cronómetro con serie vigente, se envía con espera de 1 s y el valor final (una petición por ráfaga). El cronómetro «libre» (el que abre el botón flotante sin serie vigente; antes, el botón de la cabecera) nunca envía; pausar, reanudar y reiniciar tampoco. El ajuste pendiente al cambiar de sesión se entrega a la sesión original, y si la serie ya no existe no se envía nada.
6. **Modo demo en memoria:** sin escribir en `localStorage` ni enviar al servidor.
7. **Ciclo de vida.** Se cierra solo al finalizar u omitir la sesión; al cargar una sesión `COMPLETADA` u `OMITIDA` con una clave vigente, la borra.
8. **Higiene.** `limpiarClavesEntrenamientoLocal` borra por prefijo `guachafit_cronometro_*` en el logout, en el cambio de usuario y en `cerrarSesionPorVencimiento`. Este último **no** toca IndexedDB ni la cola offline.
9. **Borrador de series sin segundo almacén.** `combinarSeriesPendientesLocales(servidor, local)` vuelca lo tecleado, desde la copia local que ya existe, sobre la sesión del servidor al cargar y antes de `cacheSesion`.
   - Solo en series con `completada === false` en ambas copias, con el mismo `id` de sesión y el mismo `alumnoId`.
   - Cada valor se valida con el contrato compartido (peso hasta 999,99 kg con 2 decimales como máximo, repeticiones enteras dentro del tope, esfuerzo dentro de su rango). Un valor inválido o vacío conserva el del servidor.
   - En series completadas gana el servidor.
   - Una copia local corrupta no impide cargar: se usan los datos del servidor.
10. **Entre dos dispositivos, en una serie pendiente prevalece lo tecleado en el dispositivo actual,** porque lo tecleado en una serie sin marcar no se envía al servidor hasta pulsar «Listo».

## 4. Consecuencias
- El descanso es exacto tras una recarga o una pantalla bloqueada, sin depender de que el navegador mantenga vivo un temporizador.
- Un cronómetro cerrado no vuelve a sonar, y el cronómetro «libre» (hoy el del botón flotante; antes, el de la cabecera) ya no altera datos de una serie.
- El alumno que recarga a mitad de una serie recupera lo que había tecleado.
- Una persona que comparte el dispositivo no hereda el cronómetro de la anterior: el logout y el cambio de usuario lo borran.
- «Sumar» y «Restar» de repeticiones parten del valor restaurado.

## 5. Costos y límites honestos
- **iOS Safari no se verificó en dispositivo.** Se asume, sin comprobarlo, que no hay vibración, que el audio depende de un gesto del usuario y del interruptor de silencio, y que el JavaScript se congela con la pantalla bloqueada. Por eso el cronómetro **recalcula al volver** y no promete un aviso con la pantalla bloqueada. Pendiente: probar en un iPhone real.
- **Sin Wake Lock:** el recálculo del temporizador no mantiene la pantalla encendida.
- **Auditoría de contraste no medida** para los controles nuevos.
- **Límite multi-dispositivo del borrador** (decisión 10): el que se teclea en otro dispositivo no se ve hasta marcar la serie.
- **Seguimientos fuera de alcance:** precarga del peso con el plan; repeticiones prellenadas con el objetivo (se envía `repsLogradas ?? repsObjetivo`, un dato que parece real); desmarcar una serie sin confirmación ni deshacer; `enterKeyHint` y seleccionar el contenido al enfocar los inputs; campo de notas del modal de cierre con `text-xs` (zoom en iOS) y etiquetas de 11 px; `aria-pressed` en «Listo»; deshabilitar «Restar 15 segundos» con el descanso ya terminado; avisar también en la píldora que con la pantalla bloqueada no suena.

## 6. Alternativas descartadas
- **Decremento con `setInterval` sobre los segundos restantes:** se congela con la pantalla bloqueada y se pierde al recargar; obliga a corregir la deriva a mano.
- **Segundo almacén para el borrador de series:** la copia local (`offlineDb.rutinaHoy`) ya guarda lo tecleado; un segundo almacén duplicaría la fuente de verdad y añadiría sincronización y limpieza.
- **Regla por marcas de tiempo (gana lo más reciente) para el borrador:** compara el reloj del móvil con el del servidor; con un móvil atrasado el borrador se perdería sin avisar al alumno. Se prefirió una regla simple y explicable: en una serie pendiente gana lo tecleado en este dispositivo.
- **Sincronizar el cronómetro entre pestañas:** descartado por YAGNI (no se necesita hoy); el orden entre pestañas ya es un límite documentado ([[ADR-024-orden-envios-sesion-entrenamiento]]).
- **Wake Lock o notificaciones push para avisar con la pantalla bloqueada:** el Wake Lock mantiene la pantalla encendida durante todo el entrenamiento, lo que cambia el uso de batería, y no se verificó en iOS; las notificaciones push exigen el permiso del alumno y que el servidor programe el envío del aviso, más complejidad de la que justifica un descanso de minutos. Se prefirió no prometer ese aviso y decirlo en el panel.

## 7. Trazabilidad
- Requerimientos: [[RF-001-checklist-entrenamiento-diario]] (RN-06, RN-07 y RN-08, escenarios 6 a 8, casos borde y §7.21).
- Decisiones relacionadas: [[ADR-021-modo-foco-entrenamiento-alumno]], [[ADR-014-actualizaciones-guiadas-sw-frescura-offline]], [[ADR-024-orden-envios-sesion-entrenamiento]].
- Implementación: `8bcfa95` (web); addendum del botón flotante: `24d506f` (dependencia e `index.css`) y `4a84375` (botón flotante). Guía de pruebas manuales, sección 1.

## 8. Addendum 2026-11-04: botón flotante y animaciones
Añade, sin cambiar las decisiones 1 a 10 de §3. Cambia **cómo se abre** el cronómetro y **cómo se mueve**; el estado absoluto, la persistencia, el aviso y la regla de `descansoSegundos` siguen igual. Refina [[RF-001-checklist-entrenamiento-diario]] (RN-06, RN-07, escenario 9 y §7.21).

### 8.1. Decisión
1. **El acceso es un botón flotante (FAB)** abajo a la derecha, por encima de la barra inferior (`z-[45]`), en la zona del pulgar y respetando el área segura. La cabecera conserva solo el selector kg/lb; el botón «Descanso» de la cabecera se retira. Nombre accesible: «Abrir cronómetro de descanso».
2. **Un único widget con tres estados:** botón en reposo → píldora con la cuenta atrás → panel expandido. Se monta en un portal sobre `document.body`.
3. **Qué hace el toque.** Abre el panel con el descanso **libre en pausa a 90 s** y el foco en «Reanudar descanso». Elegir un preset (60, 90, 120 o 180 s) o «Reanudar descanso» lo arranca. El descanso libre **nunca envía** `descansoSegundos` (decisión 5 de §3, sin cambios). Marcar una serie sigue abriendo la píldora **en marcha** con el descanso de esa serie y **sin robar el foco**.
4. **Cuándo se ve.** Solo con la sesión **en curso** y sin un modal propio abierto (finalizar, cierre vacío, video de técnica, panel de la cola offline). No aparece en la vista previa de una sesión planificada, en carga, en error, sin conexión y sin caché, sin sesión, con la sesión completada u omitida ni con el acceso bloqueado.
5. **Ocultar no es cerrar.** Si el botón se oculta por un modal, el cronómetro sigue contando y el aviso suena. La región `aria-live` «Descanso terminado» está siempre montada. Al cerrar con la X, el foco vuelve al botón flotante. La página reserva un margen inferior mientras el botón es visible, para que no tape el contenido.
6. **Movimiento.**
   - Entrada con las variantes `starting:` de Tailwind v4.
   - Salida animada **solo al cerrar** (150 ms, `ease-in`) con la última vista congelada, `aria-hidden`, `inert` y sin mostrar «0:00».
   - Píldora ↔ panel y ocultar por un modal son **instantáneos**.
   - Al terminar el descanso, un destello breve de 2 repeticiones (`animate-destello-fin`) sustituye al `animate-pulse` infinito.
   - La regla global de movimiento reducido ([[00_Reglas_Desarrollo_SDD]] §6.16) sigue siendo **única y lo último de `index.css`**.
7. **Dependencia nueva: `tw-animate-css@1.4.0`** (MIT, sin dependencias ni scripts de instalación, importada en `index.css`). Decisión del dueño, con los tradeoffs de §8.3.
8. **`animate-fade-in` queda definida en `index.css`** y anima **solo la opacidad**. Nadie la definía: `AppLayout` la usaba en el `<main>` de todas las pantallas sin efecto alguno.

### 8.2. Por qué la dependencia
El código ya usaba 60 veces `animate-in`, `fade-in`, `zoom-in-95` y `slide-in-from-*` (todos los modales y paneles, 49 archivos), pero Tailwind v4 **no las trae** y el proyecto no tenía el paquete: no producían ninguna animación. Esa era la causa de que la app se sintiera «cruda». El paquete activa lo que el código ya pedía sin tocar esos 49 archivos.

### 8.3. Costos y efecto global
- **Efecto global:** desde `24d506f`, **todos** los modales y vistas con esas clases se animan al entrar. Es un cambio de comportamiento visible en toda la app, no solo en el cronómetro.
- **Una dependencia más** en la web. Mitigación: MIT, sin dependencias transitivas ni scripts de instalación (compatible con `ignore-scripts=true`, [[00_Reglas_Desarrollo_SDD]] §3).
- **`animate-fade-in` solo con opacidad:** con `transform` habría creado un bloque contenedor y roto lo `position: fixed` dentro del `<main>`.
- **No hay salida de modales:** el código no usa `animate-out`, `fade-out` ni `zoom-out`, así que los modales siguen **desmontándose de golpe al cerrar**. Queda como pendiente aparte.

### 8.4. Alternativas descartadas
- **Mantener el botón «Descanso» de la cabecera:** la cabecera queda arriba, lejos del pulgar, y el dueño lo percibía poco accesible durante el entrenamiento. Se retiró para que la cabecera conserve solo el selector kg/lb.
- **Botón flotante que arranca el descanso al tocarlo:** un toque accidental pondría a contar y a sonar un descanso que el alumno no pidió. Se prefirió abrir el panel en pausa a 90 s con el foco en «Reanudar descanso», para que arrancar sea un segundo gesto consciente (o un preset).
- **Transformar el tamaño con layout (píldora → panel animando ancho y alto):** animar propiedades de layout fuerza recálculos en cada cuadro y rompe la regla de animar solo `transform` y `opacity`. Píldora ↔ panel cambian al instante.
- **Librería de animación (Motion, GSAP):** pesa más y añade una API paralela para algo que CSS resuelve; no justifica el costo en el bundle de una PWA móvil por un widget y entradas de modales.
- **Utilidades propias en lugar de `tw-animate-css`:** habría que reimplementar y mantener a mano el conjunto de utilidades que ya usan 49 archivos (`animate-in`, `fade-in`, `zoom-in-95`, `slide-in-from-*`, con sus duraciones y variables). Un paquete MIT de una sola hoja de estilos resuelve lo mismo con menos código propio.
- **Añadir `animate-out` en esta pasada:** amplía el alcance a los modales de toda la app (demorar el desmontaje de cada uno, con Radix y con estados propios) y mezcla un cambio global con el lote del cronómetro. Se deja como pendiente separado.

### 8.5. Consecuencias
- El alumno encuentra el cronómetro siempre en el mismo sitio, al alcance del pulgar, sin salir de la serie.
- La cabecera queda más simple; el botón flotante reserva espacio al pie de la pantalla de entrenamiento.
- La entrada y la salida del widget se animan, y el fin del descanso se señala con un destello breve en vez de un pulso infinito.
- Todos los modales se animan al entrar (efecto global de §8.3).

### 8.6. Evidencia
Lote **88/88**; suite web completa **3.372/3.372**; typecheck y build sin errores. Revisión de fiabilidad: 0 BLOCKER, 4 WARNING (2 corregidos y 2 rechazados con razón) y 3 SUGGESTION (2 anotadas como seguimiento y 1 aceptada).
- **Corregidos:** la instantánea de la capa saliente solo se refresca cuando cambia algo visible (antes provocaba una pasada extra de render en cada tick); la intención «abierto por el botón» caduca si el toque no abre el cronómetro (antes la siguiente apertura automática habría salido como panel robando el foco).
- **Rechazados con razón:** un snapshot de otra sesión durante los 150 ms de salida (inerte y del propio usuario); la pérdida de foco con el widget oculto (inalcanzable: solo la X del widget visible activa esa bandera).

### 8.7. Límites y riesgos no verificados en dispositivo
- **`transform` de `animate-in` y elementos `fixed`:** `animate-in` aplica un `transform` mientras dura la entrada (unos 300 ms), y eso crea un bloque contenedor para los descendientes `fixed`. Un modal `fixed inset-0` **sin portal**, colgado de una página con `animate-in fade-in duration-300`, quedaría confinado si se abre dentro de esa ventana. El revisor citó `AlumnoDetallePage`, `AlumnosPage`, `PagosPage` y `ModalPlanComercial`. No se comprobó en dispositivo.
- **Teclado móvil:** el panel expandido (unos 300 px) puede tapar el input que se edita cuando sube el teclado; `index.html` no declara `interactive-widget`. Seguimiento posible: plegar el panel al enfocar un input.
- **Dispositivo:** el aspecto real del movimiento, iOS, la vibración y el audio no se probaron en un iPhone.

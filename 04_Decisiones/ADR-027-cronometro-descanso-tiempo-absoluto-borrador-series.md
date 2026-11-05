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

## 9. Addendum 2026-11-04: salida animada de modales y pendientes de UI

### 9.1. Decisión
- **`useSalidaModal`** (`apps/web/src/lib/use-salida-modal.ts`): al cerrar, el fondo del modal (`fixed inset-0`) se apaga 150 ms con `animate-out` y solo entonces se llama al cierre real; el modal sigue montado mientras tanto (`data-saliendo`, `pointer-events-none`). Se aplica a los 27 modales con `fixed inset-0`.
- **Sin retraso cuando no hay animación:** si el sistema pide movimiento reducido o el entorno no tiene `window.matchMedia` (jsdom), `cerrar()` llama al cierre de forma síncrona. Así los specs existentes no cambian y quien pide menos movimiento no espera.
- **Confinamiento por `transform` resuelto en origen:** las raíces de `AlumnoDetallePage`, `AlumnosPage`, `PagosPage`, `ProgresoPage`, `PlantillasPage`, `MonitorAdherenciaPage` y `AdminPage` (más tres contenedores internos de `PagosPage` y `ProgresoPage`) pasan de `animate-in fade-in` a `animate-fade-in` (solo opacidad). Ninguna usaba `slide` ni `zoom`. Un guardián (`modales-salida-animada.spec.ts`) exige que no vuelvan a llevar `animate-in`.
- **Cronómetro:** el panel expandido se pliega a píldora cuando el foco entra en un `input`, `textarea` o `select` ajeno al widget (`usePlegarAlEnfocarCampo`); `index.html` declara `interactive-widget=resizes-content`; «Restar 15 segundos» se deshabilita con el descanso terminado; la píldora lleva el aviso de pantalla bloqueada como texto accesible (no visible, para seguir discreta).
- **Serie y cierre:** peso y repeticiones con `enterKeyHint="next"`, esfuerzo con `done`, y los tres seleccionan su contenido al enfocar; las notas del modal de cierre pasan de `text-xs` a `text-base` (evita el zoom de iOS) y las etiquetas de 11 px a `text-xs`.

### 9.2. Límites aceptados
- **Escape instantáneo en 10 modales** cuyo `useDialogoAccesible` vive en el padre (`ModalFinalizarSesion`, `ModalCierreVacio`, `ModalVideoTecnica`, `ModalInscripcionAlumno`, `ModalEnlaceCaptacion`, `ModalCobroSala`, `ModalControlAntropometrico`, `ModalRutinaSemanal`, `ModalRecordatorioCartera`, `ModalCobroCartera`, `EditorMetasNutricion`): fondo, X y Cancelar animan; Escape cierra al instante. Unificarlo exige mover el hook al modal o pasar el cierre al padre.
- **`ModalPlantilla`** solo anima «Salir sin guardar»: su `onCerrar` decide en el padre si abre la confirmación o cierra, y retrasarlo haría que el modal se apagara y reapareciera.
- Acciones (guardar, confirmar, «Sincronizar», «No volver a mostrar») y navegaciones siguen inmediatas.
- **Rechazado `aria-pressed` en «Listo»:** su `aria-label` ya expresa el estado («Marcar serie N como completada/pendiente»); añadirlo duplicaría el anuncio.
- **No verificado en dispositivo:** el plegado del panel con el teclado real (`interactive-widget` solo lo respeta Chrome Android), el movimiento en un móvil y iOS.

### 9.3. Evidencia
Lote **99/99**; suite web completa **3.471/3.471**; typecheck y build en 0 (JSON en el cierre del lote). Revisión de fiabilidad: 0 BLOCKER, 0 WARNING, 4 SUGGESTION (las asimetrías de §9.2). Dos defectos de los specs del lote (un matcher sin el espacio de `+30 s` y lecturas de archivo con `node:fs` que rompían typecheck y build) los detectó la verificación y se corrigieron antes del cierre. Un test del `DashboardPage` falló una vez en la pasada concurrente y pasó 7/7 aislado; en la pasada final de la suite pasó.

## 10. Addendum 2026-11-04: Escape animado en todos los modales y precarga del peso con el plan

### 10.1. Escape animado (sustituye el primer límite de §9.2)
- Los 11 modales cuyo `useDialogoAccesible` vivía en el padre (`ModalFinalizarSesion`, `ModalCierreVacio`, `ModalVideoTecnica`, `ModalInscripcionAlumno`, `ModalEnlaceCaptacion`, `ModalCobroSala`, `ModalControlAntropometrico`, `ModalRutinaSemanal`, `ModalRecordatorioCartera`, `ModalCobroCartera`, `EditorMetasNutricion`) llaman ahora al hook **dentro del modal** (`abierto: true`, `onCerrar: cerrar` de `useSalidaModal`) y ponen su propio ref. Se retiró la prop `dialogRef`/`refDialogo`/`dialogoRef` y las llamadas en `use-cierre-sesion`, `use-video-tecnica`, `useRecordatorioCartera`, `useCobroCartera`, `use-editor-metas-nutricion`, `AlumnosPage` y `AlumnoDetallePage`. Un guardián estático impide que vuelvan.
- **Límite nuevo (SUGGESTION de la revisión):** en `EditorMetasNutricion` con el formulario modificado, Escape apaga el editor 150 ms y reaparece con la confirmación «¿Salir sin guardar?», porque `solicitarCerrarEditor` decide después de la salida. Es el mismo motivo por el que `ModalPlantilla` solo anima «Salir sin guardar». No hay pérdida de datos; solucionarlo exige exponer «hay cambios» al modal.
- Siguen instantáneos: `ModalPlantilla` (salvo «Salir sin guardar»), las acciones y las navegaciones (§9.2).

### 10.2. Decisión del dueño: el peso del plan se precarga como valor real
- **Qué:** el campo de peso de una serie **pendiente** que el alumno no ha tocado (`pesoKg` null) muestra `pesoPrescritoKg` y **se envía** si marca la serie sin cambiarlo. Es editable; con `data-origen-peso="plan"` y color tenue mientras sea el valor del plan. Antes solo se mostraba «Plan: 75 kg» como texto y el campo quedaba vacío (el servidor guardaba `0.00`).
- **Contrato (`lib/entrenamiento-peso-plan.ts`):** `pesoKg` null/undefined → manda el plan (si es > 0); `''` → el alumno lo borró a propósito (el plan no reaparece y se envía `null`, RN-01); cualquier otro texto, incluido `'0.00'` → peso propio. La herencia del peso de la serie anterior (pre-rellenado inteligente) **sigue ganando** sobre el plan. El stepper parte del valor mostrado. `construirPayloadSerie` y el reenvío del temporizador derivan siempre el peso efectivo.
- **Borrador:** un `''` local se respeta aunque el servidor tenga `null`, para que el plan no reaparezca al recargar; con un peso en el servidor, el `''` local sigue sin borrarlo.
- **Tradeoff aceptado:** un peso que el alumno no confirmó puede entrar en el volumen y la racha si marca sin mirar. Se acepta por la ergonomía en el gimnasio y es coherente con las repeticiones, que ya se precargan con el objetivo. El tono tenue y el atributo permiten distinguirlo. Las repeticiones prellenadas y desmarcar con deshacer siguen sin decidirse.
- **Alternativas descartadas:** `placeholder` (no se envía y el servidor guardaría `0.00`); sembrar `pesoKg` en el API (contamina el peso real y la racha); usar el último peso del historial (el alumno no consume ese endpoint hoy).
- **Límite (SUGGESTION):** al marcar una serie con peso del plan, `serie.pesoKg` queda con ese valor; si se desmarca y se vuelve a marcar, ese valor sí se hereda a la siguiente serie. No altera volumen ni racha mientras esté desmarcada.
- **Deuda menor:** `construirPayloadSerie` conserva un segundo parámetro que ya ignora, porque un spec previo lo llama así.

### 10.3. Evidencia
Lote 74/74 y suite web completa **3.545/3.545**; typecheck y build en 0. Revisión de fiabilidad: 0 BLOCKER, 0 WARNING, 2 SUGGESTION (los límites de arriba). Probado en Chrome con la sesión de `andres.perez`: precarga de 75 kg con atributo y tono, tecleo, «+», vaciado, fila compacta tras marcar y API con `75.00`; Escape, X y fondo de `ModalFinalizarSesion` y de «Cobro directo en sala» pasan por `data-saliendo` y desaparecen antes de ~310 ms; el panel del cronómetro se pliega al enfocar el peso. La primera pasada del navegador dio resultados antiguos porque había un **service worker de una prueba anterior** (`/sw.js`, cachés `workbox-precache` y `api-cache`) sirviendo código viejo; se desregistró y se repitió.

## 11. Addendum 2026-11-04: aviso «Serie N completada · Deshacer» y bloqueo corto de «Listo»

### 11.1. Problema y decisión
- Al marcar una serie no había confirmación visible, y en modo foco la serie siguiente aparece **en el mismo sitio** que el botón de la anterior: un toque doble o un rebote marcaba la siguiente sin querer. Propuesta del dueño: un mensaje de serie completada.
- **Franja** (`AvisoSerieCompletada`): «Serie N completada» con botón «Deshacer», en flujo normal encima de la vista (foco y lista), `role="status"`, entrada solo de opacidad. Dura 6 s (`DURACION_AVISO_SERIE_MS`) y la sustituye el siguiente marcado. «Deshacer» desmarca esa serie, oculta la franja y **cierra el cronómetro de descanso** si es el de esa serie. Cierra además el pendiente de «desmarcar con deshacer».
- **Bloqueo de 600 ms** (`useBloqueoMarcado`): tras completar una serie, los botones «Marcar serie N como completada» de series pendientes quedan `disabled` y `handleToggleSet` ignora **sin ningún efecto** (ni error inline, ni háptico, ni envío) un nuevo intento de COMPLETAR. Desmarcar nunca se bloquea. Es la medida que **evita** el marcado accidental; la franja es la que permite corregirlo.
- **Visibilidad derivada:** la franja solo se muestra mientras la serie del aviso conserve su `id` y siga completada (cambiar de bloque o desmarcar por otra vía la oculta en ese render, sin efectos).

### 11.2. Alternativas descartadas
- Diálogo de confirmación por serie: ralentiza cada serie con las manos ocupadas.
- Retrasar la aparición de la siguiente serie: castiga al que marca bien y no frena el toque doble.
- Bloqueo por botón sin guardia en el manejador: un evento sintético o el teclado lo saltarían.

### 11.3. Límites aceptados
- **Foco tras «Deshacer»** (SUGGESTION): la franja se desmonta y el foco cae al `body`; no se mueve al botón de la serie desmarcada porque, en la lista, el número de serie no identifica el botón sin un ancla por `id`.
- **Ref asignada en render** (`avisoVigente`, SUGGESTION): patrón ya usado en el módulo; se mantiene.
- Tras «Deshacer», volver a completar la misma serie se ignora hasta que pasen los 600 ms del marcado anterior.
- Los 6 s de la franja pueden quedarse cortos para un lector de pantalla; el texto se anuncia al aparecer (`role="status"`).

### 11.4. Evidencia
Lote 9/9 y suite web completa **3.572/3.572**; typecheck y build en 0. Revisión de fiabilidad: 0 BLOCKER, 2 WARNING (franja de una sesión anterior y efectos previos al bloqueo con datos inválidos: **corregidos** con visibilidad derivada y moviendo la guarda al inicio, con tests de regresión) y 2 SUGGESTION (arriba). Cuatro specs previos que marcaban series de corrido (`EntrenamientoPage.foco/orden/rechazo/vista`) solo ganaron esperas de 600 ms. Probado en Chrome con `andres.perez`: franja con «Serie 1 completada» y «Deshacer», serie 2 deshabilitada a los 100 ms y habilitada a los 900 ms (el clic sobre ella no marcó), franja visible hasta los 5 s y ausente a los 6 s, doble clic sin marcar dos series y desmarcar desde la lista oculta la franja; «Deshacer» comprobado con clic desde JavaScript (la franja expiró antes del clic real por la latencia de las herramientas).

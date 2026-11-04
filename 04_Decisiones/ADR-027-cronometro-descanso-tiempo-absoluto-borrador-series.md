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
`implementado` en `8bcfa95` (2026-11-04). Refina [[RF-001-checklist-entrenamiento-diario]] (RN-06, RN-07 y RN-08, §7.21) y completa el modo foco de [[ADR-021-modo-foco-entrenamiento-alumno]]. Respeta la persistencia local y la frescura offline de [[ADR-014-actualizaciones-guiadas-sw-frescura-offline]] y la regla de §7.10 de RF-001 de conservar la cola offline ante una sesión vencida.

## 2. Contexto
- El cronómetro anterior restaba un segundo por tick de un `setInterval` sobre un estado en memoria. Al recargar el estado se perdía, y con la pantalla bloqueada los ticks dejan de ejecutarse, así que el descanso se perdía o se desfasaba.
- Dos defectos reales: el cronómetro cerrado seguía sonando, y el botón «Descanso» de la cabecera abría un cronómetro «libre» cuyo «+30» reescribía el `descansoSegundos` de la última serie marcada.
- `descansoSegundos` es el **objetivo** del temporizador y no una medición ([[RF-001-checklist-entrenamiento-diario]] §7.7); no debía cambiar por efectos colaterales.
- Lo que el alumno tecleaba en una serie pendiente (peso, repeticiones, esfuerzo) ya se guardaba en la copia local de la sesión (`offlineDb.rutinaHoy`), pero al recargar se cargaba la sesión del servidor y se perdía.

## 3. Decisión
1. **Tiempo absoluto.** El estado guarda el instante de fin (`finEnMs`), no los segundos restantes. El tiempo restante se calcula contra el reloj en cada lectura, y al volver a la pestaña (`visibilitychange` y `pageshow`) se recalcula.
2. **Persistencia por sesión en `localStorage`** (`guachafit_cronometro_<sesionId>`). Sobrevive a recargas. La duración se acota a 10 s–10 min y el estado caduca a las 6 h.
3. **Un widget con pausa, reanudar, reiniciar, ±15 s y presets** de 60, 90, 120 y 180 s, en píldora y panel expandido (anillo o barra de progreso, `role="timer"`, aviso en región `aria-live`, safe-area, áreas de 44 px, foco visible). El panel dice con honestidad: «Con la pantalla bloqueada no podemos avisarte».
4. **Reglas del aviso.** Suena **una sola vez**. Cerrar detiene y borra el estado. No suena al recargar con el descanso ya vencido ni si el alumno vuelve más de 30 s después del fin: queda «terminado» en silencio. Hay un único `AudioContext` reutilizado, desbloqueado en un gesto del usuario (marcar serie, reanudar, reiniciar, preset, ±15 s). El callback `alTerminar` va aislado con `try/catch`.
5. **`descansoSegundos` sigue siendo el objetivo.** Solo cambia por una acción del alumno (±15 s o preset) sobre un cronómetro con serie vigente, se envía con espera de 1 s y el valor final (una petición por ráfaga). El cronómetro «libre» de la cabecera nunca envía; pausar, reanudar y reiniciar tampoco. El ajuste pendiente al cambiar de sesión se entrega a la sesión original, y si la serie ya no existe no se envía nada.
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
- Un cronómetro cerrado no vuelve a sonar, y el botón de la cabecera ya no altera datos de una serie.
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
- Implementación: `8bcfa95` (web). Guía de pruebas manuales, sección 1.

---
id: RF-001
modulo: Entrenamiento
prioridad: alta
estado: implementado
version_implementada: v1.3.0
fecha_verificacion: 2026-11-04
problema_origen: "[[PROB-001-adherencia-trazabilidad]]"
fecha_creacion: 2026-09-05
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - entrenamiento
---

# RF-001: Checklist Interactivo de Entrenamiento Diario y Monitor Semanal

## 1. Contexto y Justificación
Reemplaza la entrega pasiva de rutinas estáticas (PDF/WhatsApp) por una experiencia interactiva guiada. Proporciona al alumno una interfaz de ejecución en tiempo real y al entrenador visibilidad continua sobre la adherencia real del plan de ejercicios.

- **Objetivo:** Capturar series, repeticiones y cargas levantadas en cada sesión, calculando rachas de constancia y alertando al coach sobre alumnos en riesgo de abandono.
- **Valor aportado:** Trazabilidad precisa de sobrecarga progresiva y detección temprana de deserciones.
- **Trazabilidad:** Resuelve el dolor planteado en [[PROB-001-adherencia-trazabilidad]].

---

## 2. Actores Involucrados
- **Actor Primario:** Alumno / Cliente.
- **Actores Secundarios:** Entrenador, Motor de Notificaciones / Gamificación.

---

## 3. Precondiciones
1. El alumno debe tener una rutina activa asignada por el entrenador para la fecha corriente o semana en curso.
2. El perfil del alumno debe estar en estado activo.

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Checklist de Ejercicios):** Cada sesión programada lista los ejercicios del día. El alumno puede marcar series completadas, registrando opcionalmente: número de repeticiones efectivas y peso (kg/lb).
- **RN-02 (Cálculo de Racha):** Al pulsar *"Finalizar Entrenamiento"*, el sistema valida si se completó al menos el 70% del volumen prescrito para incrementar el contador de días consecutivos de racha (`streak_count`).
- **RN-03 (Semáforo Semanal del Coach):** Al inicio de cada semana (Lunes 00:00) se evalúa el plan semanal prescrito contra lo ejecutado:
  - **Verde:** $\ge 80\%$ de sesiones completadas según el plan.
  - **Amarillo:** Entre $50\%$ y $79\%$ de sesiones completadas (en riesgo).
  - **Rojo:** $< 50\%$ de sesiones completadas o inactividad $> 4$ días consecutivos.
- **RN-04 (Acción Explícita de Inicio vs. Consulta Pasiva de Datos):** Iniciar sesión en la app (login) o navegar por la pantalla de rutinas para ver qué ejercicios tocan, revisar pesos anteriores o consultar métricas es una acción de **solo lectura**. La sesión permanece en estado `Planificada`. El estado cambia a `EnProgreso` ÚNICAMENTE si el alumno pulsa conscientemente el botón *"Comenzar a entrenar"*.
- **RN-05 (Persistencia en UTC y Presentación en Timezone del Cliente):** 
  - Todo timestamp operativo (`fecha_inicio_utc`, `fecha_fin_utc`, marcas de tiempo de series) se almacena y procesa en el backend estrictamente en **UTC** (ISO 8601 con sufijo `Z`).
  - La aplicación cliente (móvil/PWA/web) detecta la zona horaria del dispositivo (ej. `Intl.DateTimeFormat().resolvedOptions().timeZone`) y es la responsable de convertir y mostrar las horas en el horario local del alumno o del entrenador.
- **RN-06 (Cronómetro de descanso con tiempo absoluto):** Al marcar una serie arranca un cronómetro de descanso cuyo estado guarda el **instante de fin absoluto** y no una cuenta regresiva. Por eso sobrevive a una recarga y a la pantalla bloqueada: al volver, el tiempo restante se recalcula contra el reloj.
  - **Persistencia:** una entrada por sesión en el `localStorage` del dispositivo (`guachafit_cronometro_<sesionId>`). La duración se acota entre 10 s y 10 min y el estado caduca a las 6 h.
  - **Controles:** pausar, reanudar, reiniciar, sumar o restar 15 s y elegir un preset de 60, 90, 120 o 180 s. Se ve como una píldora y se expande a un panel.
  - **Acceso por botón flotante:** el cronómetro se abre con un botón flotante abajo a la derecha, por encima de la barra inferior y en la zona del pulgar (nombre accesible «Abrir cronómetro de descanso»). Es un único widget con tres estados: botón en reposo, píldora con la cuenta atrás y panel expandido. La cabecera ya no tiene botón «Descanso»: conserva solo el selector kg/lb.
  - **Toque en el botón flotante:** abre el panel con el descanso **libre en pausa a 90 s** y el foco en «Reanudar descanso». Elegir un preset (60, 90, 120 o 180 s) o «Reanudar descanso» lo arranca. Marcar una serie sigue abriendo la píldora **en marcha** con el descanso de esa serie, sin robar el foco.
  - **Visibilidad del botón flotante:** solo aparece con la sesión **en curso** y sin un modal propio abierto (finalizar, cierre vacío, video de técnica, panel de la cola offline). No aparece en la vista previa de una sesión planificada, en carga, en error, sin conexión y sin caché, sin sesión, con la sesión completada u omitida ni con el acceso bloqueado. **Ocultarlo no cierra el cronómetro:** sigue contando y el aviso suena; la región `aria-live` «Descanso terminado» está siempre montada. Al cerrar con la X, el foco vuelve al botón flotante.
  - **Aviso de fin:** suena **una sola vez**. Cerrar el cronómetro lo detiene y borra su estado. No suena al recargar con el descanso ya vencido ni si el alumno vuelve más de 30 s después del fin: queda «terminado» en silencio.
  - **Fin de la sesión:** el cronómetro se cierra solo al finalizar u omitir la sesión.
  - **Honestidad con la pantalla bloqueada:** el panel dice «Con la pantalla bloqueada no podemos avisarte». La web no promete un aviso que el navegador no garantiza.
- **RN-07 (`descansoSegundos` es un objetivo, no una medición):** Solo cambia por una acción del alumno (±15 s o un preset) sobre un cronómetro que tiene una serie vigente. Pausar, reanudar y reiniciar nunca lo envían. El cronómetro «libre» (el que abre el botón flotante sin serie vigente, en pausa a 90 s) nunca lo envía. Los cambios de una ráfaga se agrupan en **una sola petición** con el valor final (espera de 1 s). Si la serie ya no existe, no se envía nada. La medición del descanso real sigue siendo la de §7.7.
- **RN-08 (Lo tecleado en una serie pendiente sobrevive a una recarga):** El peso, las repeticiones y el esfuerzo que el alumno escribe en una serie sin marcar se conservan en la copia local de la sesión y se vuelven a mostrar al recargar. Aplica solo a series pendientes en ambas copias, de la misma sesión y del mismo alumno, y cada valor se valida con los límites de §7.11. Un valor inválido o vacío conserva el del servidor. En una serie completada gana siempre el servidor.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Consulta Pasiva de la Rutina (Sin Iniciar Entrenamiento)
```gherkin
Given que el alumno ha iniciado sesión en la app
  And accede a la pantalla de la rutina programada para hoy
When navega entre los ejercicios para consultar series, notas y videos demostrativos
  And NO presiona el botón "Comenzar a entrenar"
Then la sesión debe mantenerse en estado "Planificada"
  And no se debe registrar ningún timestamp de inicio en el backend
  And el entrenador no debe ver al alumno como "En Progreso"
```

### Escenario 2: Acción Explícita de Comenzar Entrenamiento
```gherkin
Given que el alumno se encuentra listo físicamente en el gimnasio
  And su sesión de hoy está en estado "Planificada"
When presiona el botón interactivo "Comenzar a entrenar"
Then el sistema debe transicionar el estado de la sesión a "EnProgreso"
  And capturar el timestamp exacto del momento en UTC (ej. "2026-09-06T10:15:00Z")
  And almacenar la zona horaria del dispositivo cliente (ej. "America/Caracas")
  And habilitar los inputs del checklist interactivo para marcar series y pesos
```

### Escenario 3: Finalización Exitosa de Sesión y Aumento de Racha
```gherkin
Given que el alumno tiene una sesión en estado "EnProgreso"
  And ha marcado como completadas las series de al menos 4 de 5 ejercicios
When presiona el botón "Finalizar Entrenamiento"
Then el sistema debe marcar la sesión con estado "Completada"
  And registrar el timestamp de finalización en UTC
  And convertir los timestamps a la zona horaria local del alumno para mostrar la duración total
  And incrementar en +1 la racha de entrenamientos del alumno
  And emitir una confirmación visual motivacional en pantalla
```

### Escenario 4: Monitoreo Semanal en Panel del Entrenador
```gherkin
Given que el entrenador accede a la vista de "Monitor de Alumnos"
When consulta el estado de la semana en curso
Then el sistema debe mostrar a cada alumno con su indicador de semáforo correspondiente (Verde, Amarillo o Rojo)
  And permitir ordenar a los clientes por nivel de riesgo (Rojo en la parte superior)
  And mostrar las horas de entrenamiento convertidas a la zona horaria local del entrenador
```

### Escenario 5: Intento de Cierre de Sesión Vacía
```gherkin
Given que el alumno comenzó el entrenamiento pero no ha marcado ninguna serie ni ingresado datos
When presiona el botón "Finalizar Entrenamiento"
Then el sistema debe solicitar confirmación: "¿Deseas registrar este día como descansado o incompleto?"
  And no debe incrementar la racha de cumplimiento positivo
```

### Escenario 6: El Cronómetro de Descanso Sobrevive a la Recarga y a la Pantalla Bloqueada
```gherkin
Given que el alumno marcó una serie y el cronómetro de descanso corre con 90 s por delante
When recarga la página, o bloquea la pantalla y vuelve 40 s después
Then el cronómetro muestra el tiempo restante real calculado contra el reloj, no el valor de antes de recargar
  And si el descanso ya venció, queda "terminado" sin sonar cuando pasaron más de 30 s desde el fin
  And si el descanso no ha vencido, sigue corriendo y suena una sola vez al terminar
```

### Escenario 7: Ajustar el Descanso Envía Solo el Valor Final
```gherkin
Given que el cronómetro tiene una serie vigente y un descanso objetivo de 90 s
When el alumno pulsa "Sumar 15 segundos" tres veces seguidas
Then el objetivo pasa a 135 s
  And el cliente envía una única petición con descansoSegundos = 135 tras 1 s sin más cambios
  And pausar, reanudar o reiniciar el cronómetro no envían nada
```

### Escenario 8: Recuperar lo Tecleado en una Serie Pendiente
```gherkin
Given que el alumno escribió peso 62,5 y repeticiones 8 en una serie sin marcar
  And recargó la página antes de pulsar "Listo"
When la sesión se carga de nuevo desde el servidor
Then la serie pendiente muestra peso 62,5 y repeticiones 8
  And una serie ya completada conserva los valores del servidor
```

### Escenario 9: Abrir el Cronómetro con el Botón Flotante
```gherkin
Given que el alumno tiene una sesión "EnProgreso" y ningún modal abierto
  And el botón flotante "Abrir cronómetro de descanso" está visible abajo a la derecha
When toca el botón flotante
Then se abre el panel del cronómetro con el descanso libre en pausa a 90 s
  And el foco queda en "Reanudar descanso"
  And no se envía ningún descansoSegundos al servidor
When elige el preset de 120 s
Then el descanso arranca en 120 s y sigue sin enviarse nada al servidor
When cierra el panel con la X
Then el widget sale con una animación de 150 ms y el foco vuelve al botón flotante

Given que el cronómetro corre
When el alumno abre el modal de finalizar el entrenamiento
Then el botón flotante se oculta sin cerrar el cronómetro
  And el descanso sigue contando y el aviso suena al terminar

Given que la sesión está "Planificada" (vista previa), "Completada" u "Omitida", o la pantalla está cargando, en error, sin conexión y sin caché, o con el acceso bloqueado
Then el botón flotante no aparece
```

---

## 6. Casos Borde y Excepciones
- **Uso sin conexión (Offline-first):** Si el alumno entrena en un sótano o gimnasio sin señal de datos, el cliente móvil/PWA debe cachear localmente las series y sincronizarlas al detectar conexión.
- **Entrenamientos fuera de día planificado:** Permitir al alumno ejecutar una sesión aplazada o adelantar un día sin romper la integridad del historial.
- **Cronómetro (RN-06 y RN-07):**
  - Un estado caducado (más de 6 h) se descarta.
  - Cerrar el cronómetro lo detiene y borra; no vuelve a sonar al recargar.
  - En el modo demo funciona en memoria: no escribe en el `localStorage` ni envía nada al servidor.
  - Al cargar una sesión ya `COMPLETADA` u `OMITIDA` con una clave vigente, la clave se borra.
  - El audio del aviso se desbloquea con un gesto del alumno (marcar una serie, reanudar, reiniciar, elegir un preset o ±15 s) y se reutiliza un único `AudioContext`. El fin del descanso también se anuncia en una región `aria-live`. Un fallo del aviso (`alTerminar`) queda aislado y no rompe el cronómetro.
  - Si el alumno cambia de sesión con un ajuste de descanso pendiente de envío, el ajuste se entrega a la sesión original.
  - **Botón flotante:** el toque abre el descanso libre en pausa (nunca envía `descansoSegundos`); marcar una serie abre la píldora en marcha sin robar el foco. Si el toque no abre el cronómetro, la intención «abierto por el botón» caduca y la siguiente apertura automática no sale como panel con foco. Ocultar el botón por un modal no cierra el cronómetro ni silencia el aviso. La salida (150 ms) deja la última vista congelada, con `aria-hidden` e `inert`, sin mostrar «0:00»; píldora ↔ panel y ocultar por un modal son instantáneos. Al terminar el descanso, la píldora hace un destello breve de 2 repeticiones y no un pulso infinito. Con `prefers-reduced-motion` rige la regla global de [[00_Reglas_Desarrollo_SDD]] §6.16.
- **Cierre de sesión (logout), cambio de usuario y sesión vencida:** las claves `guachafit_cronometro_*` se borran por prefijo para que otra persona en el mismo dispositivo no herede el descanso. El cierre por vencimiento **no** toca IndexedDB ni la cola offline (regla vigente de conservar la cola, §7.10).
- **Borrador de series (RN-08):** una copia local corrupta no impide cargar la sesión: se usan los datos del servidor. «Sumar» y «Restar» de repeticiones parten del valor restaurado.
- **Varios dispositivos y borrador:** en una serie pendiente prevalece lo tecleado en **este dispositivo**, porque lo tecleado en una serie sin marcar no se envía al servidor hasta pulsar «Listo». Se descartó comparar marcas de tiempo (ver [[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]]).

---

## 7. Notas de Implementación (v1.3.0)

> Registro de decisiones de implementación y límites conocidos de la entrega verificada el 2026-09-20. Los criterios de aceptación Gherkin de la sección 5 permanecen sin cambios.

### 7.1. Racha por volumen prescrito (RN-02)
- **Fórmula:** `ratioVolumenPct = (Σ peso_kg × reps_logradas) / (Σ peso_prescrito_kg × reps_objetivo) × 100`. La sesión acredita racha con `ratioVolumenPct >= 70%`.
- **Fallback cualitativo documentado:** cuando no existe carga prescrita (peso corporal, "Moderado", etc.), se evalúa el ratio de series cualitativas completadas (`>= 70%`). Si coexisten series ponderadas y cualitativas, ambas partes deben cumplir.
- **Prescrito vs. real:** `series_registro.peso_kg` guarda el peso real levantado (se sobrescribe al sincronizar) y `peso_prescrito_kg` el prescrito (`null` si es cualitativo, sin materializar `0.00`). La captura admite kg/lb; la persistencia canónica es kg.
- **Persistencia de la racha:** `perfiles_alumno.racha_dias` + `racha_ultima_fecha` (fecha local `YYYY-MM-DD`). Día consecutivo → `+1`; hueco o primer registro → `1`; omisión o incumplimiento → no incrementa. La racha mostrada se anula si la última fecha es anterior a ayer (`calcularRachaEfectiva`).

### 7.2. Estados de sesión y cierre sin series (Escenario 5)
- `Planificada → EnProgreso` ocurre únicamente con la acción explícita del alumno (RN-04); la consulta pasiva no genera timestamps.
- Cierre sin series completadas: la API responde `400` con `code: 'SESION_VACIA'`; la UI abre el modal "¿Descansado o incompleto?".
- Con decisión explícita: `tipoCierre: DESCANSADA | INCOMPLETA` → estado `OMITIDA` con `motivo_omision: DESCANSO | INCOMPLETO`, sin incremento de racha ni notificación al coach. `tipoCierre: COMPLETADA` con 0 series se rechaza.

### 7.3. Idempotencia de mutaciones de sesión
- `X-Idempotency-Key` (opcional, generada por el cliente) en `entrenar-hoy`, `iniciar`, `sincronizar-series` y `finalizar`; el servidor deduplica por `operacion:alumnoId:key` y devuelve la respuesta original sin reprocesar.
- **Limitación conocida:** la caché server-side es un `Map` en memoria, sin TTL ni garantía multi-instancia. Un reinicio del proceso o una segunda réplica pueden reprocesar la mutación; la protección de negocio definitiva es la máquina de estados de la sesión.
- Resuelto parcial (2026-10-04, LOTE API-3 `bc53864`): el `Map` sin límite se reemplazó por `RegistroIdempotencia` (`apps/api/src/common/idempotencia/registro-idempotencia.ts`), compartido por entrenamiento, plantillas y pagos: TTL de 24 h por entrada, tope de 10 000 entradas (expulsa primero lo caducado y luego lo más antiguo), copia defensiva de la respuesta y **dedupe de envíos simultáneos** (un reintento concurrente con la misma clave espera a la primera ejecución en vez de repetirla). **Sigue pendiente:** el registro vive en la memoria del proceso; un reinicio o varias réplicas no lo comparten (válido solo con una instancia).

### 7.4. Cola offline (PWA)
- Las mutaciones encoladas de forma durable se reintentan con backoff; los errores `4xx` se muestran como rechazadas (requieren acción del alumno) y los `5xx`/fallos de red se reintentan.
- Cada ítem de la cola viaja con su propia `X-Idempotency-Key`, complementada por el dedupe server-side.
- Actualizado (2026-10-04): ver §7.10 — orden causal por sesión, tope de 8 errores del servidor y conservación de la cola ante una sesión vencida.

### 7.5. Monitor semanal del coach (RN-03)
- `GET /entrenador/monitor-adherencia?timezone=` evalúa la ventana Lunes 00:00 local → ahora.
- `tienePlanActivo = false` → "sin plan" (nunca rojo); `sinPendientesSemana = true` → "Al día — sin pendientes" (nunca rojo).
- Orden por riesgo (rojo primero) y enlace al expediente del alumno vía `alumnoPerfilId`.

### 7.6. Límites conocidos de la entrega
- Caché de idempotencia en memoria (§7.3): con TTL y tope desde 2026-10-04, pero sigue siendo por proceso (una sola instancia).
- RLS multi-tenant por etapas: ver [[RNF-003-aislamiento-multitenant-seguridad-datos-salud]].
- Verificación visual manual pendiente en algunas pantallas móviles (layout/accesibilidad del modal de video y hints); no afecta la funcionalidad.

### 7.7. Medición del descanso real (WU17)
- **Fórmula:** `descanso_real = timestamp_inicio_utc(serie siguiente) − timestamp_completada_utc(serie anterior)` (misma fórmula entre ejercicios: inicio de la primera serie del siguiente − completada de la última del anterior). `series_registro.timestamp_inicio_utc` se captura sin fricción al interactuar con la serie (peso/reps/RPE) o con el botón "Iniciar serie", una sola vez y solo en series pendientes de una sesión `EnProgreso`; las series ya completadas nunca se retro-marcan y el prefill programático no la dispara.
- **UI:** con marcas se muestra "Descanso real" y "Ejecución" (fin − inicio); sin marcas se conserva el Δ entre marcas de WU15 (cota superior) o "—". Nunca se muestran valores negativos.
- **Límite honesto:** la precisión depende de que el alumno marque el inicio; sin marca no se inventa la medición y `descansoSegundos` sigue siendo el valor del temporizador (objetivo), no el descanso efectivo. Las reglas de cuándo cambia ese objetivo están en RN-07 y en §7.21.

### 7.8. Listados server-side (WU24–WU26)
- Monitor de adherencia con búsqueda (`q`), semáforo y orden (`riesgo | nombre`) server-side y paginación `{ items, total, limit, offset, resumen }` (`limit` default 25, techo 100); historial de sesiones del alumno paginado en `GET /sesiones/alumno/{alumnoId}/historial` (`limit` default 30, techo 100). El `total` del historial y el `resumen` del monitor son siempre reales (nunca del slice de página); el detalle de contrato vive en [[03_Contratos_API_Especificacion]] §1.1 y §4.1.

### 7.9. Ergonomía móvil y honestidad offline (Ola 4)
- **Ergonomía móvil del checklist (resuelto):** steppers y objetivos táctiles con área ≥44px, inputs de peso/reps legibles, labels desde 11px e `inputMode` (`decimal`/`numeric`) según el campo; contraste AA en ambos temas.
- **Estado offline honesto (resuelto):** cuando la PWA sirve datos desde caché, la UI lo declara como tal en lugar de presentar la copia como si estuviera en vivo.
- **Aviso de frescura (resuelto):** la vista indica la antigüedad de la copia cacheada ("hace X") y no inventa una edad cuando no puede afirmarla; decisión en [[ADR-014-actualizaciones-guiadas-sw-frescura-offline]].

### 7.10. Entrenamiento usable sin conexión, cola causal y datos íntegros (2026-10-04)
- Implementado (2026-10-04, front módulos 1-2: `7f6c2a1` cola offline y `9390a4e` pantalla de entrenamiento):
  - **Cola por sesión con orden causal** (`apps/web/src/lib/offline-sync.ts`, `offline-db.ts`): un fallo frena solo lo posterior de **esa** sesión de entrenamiento; "Finalizar" espera a que suban sus series; las series rechazadas porque la sesión aún no había empezado (`SESION_NO_INICIADA`) se reactivan solas tras iniciar.
  - **Tope de reintentos:** tras **8 errores 5xx** el cambio pasa a "rechazado" y deja de bloquear al resto; los fallos de red no cuentan. El alumno puede **descartar** un cambio fallido; los motivos de rechazo se muestran legibles y sin direcciones técnicas (`SyncQueuePanel`).
  - **Sesión vencida (401):** sin sesión la cola no se procesa; un 401 devuelve el cambio a pendiente sin penalizarlo y detiene el envío. Al volver a entrar **la misma persona**, los pendientes se envían solos (ver [[RF-010-rbac-jerarquia-aislamiento-tenancy]] y [[RNF-003-aislamiento-multitenant-seguridad-datos-salud]] §4).
  - **Pantalla de entrenamiento** (`apps/web/src/pages/atleta/EntrenamientoPage.tsx`, textos en `apps/web/src/lib/entrenamiento-textos.ts`): envía o encola según haya pendientes del mismo entrenamiento; con red, una serie rechazada se revierte y muestra el error junto a ella. "Comenzar" guarda "en progreso" localmente antes de enviarse y los cambios de descanso se encolan en lugar de perderse.
  - **Sesión de hoy por fecha local** (nueva tabla local de la semana, Dexie v2 aditiva): se muestra la sesión de la fecha local del dispositivo, o la que esté **en curso aunque haya pasado la medianoche**; si no hay ninguna, se indica la fecha del último guardado ("Tu último entrenamiento guardado es del …").
  - Aviso de datos guardados sin conexión, "Hacer este entrenamiento hoy" inicia con **un solo toque**, cronómetro y controles con objetivos táctiles de 44px y etiquetas accesibles. Textos **sin jerga** para el alumno: "esfuerzo" en lugar de RPE/RIR, "repeticiones", "semana" (el modelo de datos sigue usando `rpe`).
- Implementado (2026-10-04, LOTE API-3 `bc53864`):
  - **Indicaciones técnicas y esfuerzo sugerido del coach llegan al alumno:** la rutina/plantilla copia sus notas técnicas y el esfuerzo sugerido a la sesión (migración `0014_ejercicios_sesion_indicaciones.sql`, columnas opcionales en `ejercicios_sesion`) y la pantalla del alumno los muestra.
  - **Catálogo visible por coach:** rutinas, plantillas e instanciación de sesiones solo admiten ejercicios **globales o del propio coach** (`apps/api/src/modules/entrenamiento/catalogo-ejercicios.ts`); los privados de otro coach se bloquean y el error **nombra** los ejercicios que ya no están disponibles.
  - Idempotencia con TTL y dedupe concurrente (§7.3). Códigos estables en `@guachafit/shared` (`SESION_NO_INICIADA`, `SESION_VACIA`) que la web usa para clasificar rechazos, con respaldo por texto (LOTE API-2 `eeec4e0`).
- Límites honestos / pendientes:
  - **Migración `0014` por aplicar** en los entornos (sin ella el API no arranca en producción: verifica migraciones pendientes al arrancar y solo avisa en desarrollo).
  - Carrera de orden **preexistente** en `EntrenamientoPage`: un envío directo ya en vuelo puede llegar después de un cambio encolado posterior de la misma sesión; no se corrigió en este lote. **Resuelta el 2026-10-15 en §7.17.**
  - Idempotencia en memoria del proceso (§7.3): válida con una sola instancia del API.
- Evidencia: web 701 → **771** tests tras los módulos 1-2 del front (777 tras API-2 y **785** tras API-3); API **986** tras API-3 (852 antes del lote API-1).

### 7.11. Límites de las series (2026-10-11, `c6a0e34` y `05d42bd`)
- **Decisión del dueño (2026-10-10/11):** una serie solo acepta datos que pertenezcan a su campo. **Peso** de 0 a 999 kg con 2 decimales como máximo; **repeticiones** de 0 a 200 (las prescritas, de 1 a 200); **esfuerzo** de 1 a 10 en pasos de 0,5 (`8` y `8.5` sí; `8.3`, `0` y `11` no). Aplica igual a lo que registra el alumno y a lo que prescribe el entrenador.
- **Mecanismo:** fuente única en `@guachafit/shared` (`LIMITES_SERIE`, `esPesoKgValido`, `esRpeValido`, `extraerPesoKgDeTexto` y los mensajes `MENSAJE_PESO_FUERA_DE_RANGO`, `MENSAJE_ESFUERZO_INVALIDO`, `MENSAJE_REPS_FUERA_DE_RANGO`). Se aplica en `RegistrarSerieSchema` (y por tanto en `PUT /sesiones/{id}/series`), `SeriePrescritaInputSchema`, `AjusteEjercicioPlantillaSchema` y en el texto libre de `BloqueDiaRutinaSchema`: `"Corporal"`, `"8-10"` o `"45s"` siguen siendo válidos, pero ningún número del texto de carga puede pasar de 999 ni ninguno del de repeticiones de 200. El API responde **400** con el mensaje del campo y no escribe nada.
- **Coma decimal coherente:** el esfuerzo `"8,5"` y la carga `"60,5 kg"` prescritos llegan al alumno como 8.5 y 60.50 kg (antes se truncaban a 8.0 y 60.00): la materialización usa `extraerPesoKgDeTexto`, la misma función que valida el contrato.
- **Límites:** los datos guardados antes de este cambio no se sanean (no hay migración); una rutina o plantilla antigua con un esfuerzo fuera de rango falla al **volver a guardarla** hasta corregir el valor, y al materializarse un esfuerzo no numérico queda vacío.
- **Evidencia:** spec `apps/api/test/bdd/e2-limites-serie.spec.ts` 95/95; API **1613** pasados y 7 omitidos; web **1212**; typecheck del API y de la web sin errores; revisión de fiabilidad sin bloqueos (sus hallazgos de API, resueltos en `05d42bd`).

### 7.12. Entrada de datos de las series en la web (2026-10-11, `8af2673` y `c194caa`)
- **Decisión del dueño (2026-10-11):** los inputs solo aceptan datos de su tipo; lo inválido **no llega a escribirse**. En los formularios del entrenador el peso es un número o el interruptor **"Peso corporal"** (sin texto libre) y las repeticiones prescritas son un número (`10`), un rango creciente (`8-10` u `8 - 10`) o segundos (`45 s`).
- **Mecanismo:** `apps/web/src/lib/entrada-numerica.ts` filtra al teclear con los topes de `LIMITES_SERIE` (§7.11): peso hasta 999 kg (2202 lb en la unidad del alumno), repeticiones de 0 a 200, esfuerzo de 1 a 10 en pasos de 0,5 (admite `8,` camino de `8,5`), series de 1 a 50 en los ajustes. Si el valor guardado es antiguo y ya no es válido (`'10-12 reps'`, `'1200'`), el campo deja borrarlo libremente; la validación al guardar hace el rechazo final y su aviso **nombra el ejercicio**. `CampoPesoPrescrito` interpreta el valor guardado (`'60 kg'` → 60; `'Moderado'` → peso corporal conservando su texto) y al desactivar "Peso corporal" recupera el número.
- **Dónde aplica:** pantalla de entrenamiento del alumno (peso, repeticiones —ahora texto con borrador: vaciar el campo ya no lo convierte en 0— y esfuerzo; los botones +/− se detienen en los topes), editor de plantillas, modal de rutina semanal de la ficha (el esfuerzo se valida al guardar; "RPE" pasa a "Esfuerzo (1-10)") y ajustes al asignar una plantilla. Etiquetas de estos campos a 12 px y asociadas a su input.
- **Evidencia:** web 1356/1356 (lote 141/141), typecheck y build sin errores; revisión de fiabilidad sin bloqueos, sus hallazgos corregidos en `c194caa`.

### 7.13. Vista previa antes de iniciar y series completadas en una línea (2026-10-11, `e440587` y `bb42b55`)
- **Decisiones del dueño (2026-10-10):** antes de iniciar **no se muestra ningún input** (el alumno podía marcar series de un entrenamiento que no había empezado); una serie completada **no se oculta, se compacta** para liberar pantalla sin perder la sensación de progreso. Criterios de [[00_Reglas_Desarrollo_SDD]] §6 y de la skill ui-ux-pro-max: *progressive-disclosure* y *read-only-distinction*.
- **Antes de iniciar** (`PLANIFICADA`): "Tu plan de hoy" con el resumen ("5 ejercicios · 18 series") y una lista numerada, sin cards, con una fila por ejercicio (`Sentadilla — 4 × 10 · 60 kg · Esfuerzo 8`) y el botón "Ver técnica" si hay video. El botón **"Iniciar entrenamiento"** queda fijo sobre la barra inferior del móvil (respeta el área segura) y es el único punto de inicio; si el inicio falla, el error aparece **junto al botón**. Componentes `VistaPreviaSesion` y `lib/sesion-vista.ts`.
- **Serie completada:** una fila de 44 px (`✓ Serie 2 · 60 kg × 10 · Esfuerzo 8`); al tocarla se abre la fila completa para corregir o desmarcar y se compacta al volver a completarla. En una sesión terminada la fila es solo informativa. Componente `FilaSerieCompletada`.
- **Corrección de un defecto real:** el alumno **no podía marcar una serie sin escribir un peso** (el peso vacío se trataba como inválido, aunque RN-01 lo declara opcional y el API nunca lo prerrellena): ahora se acepta como "sin peso", y un `0.00` guardado se muestra vacío.
- **Accesibilidad:** el inicio se anuncia ("Entrenamiento en curso") y el cronómetro de una sesión anterior se cierra antes de iniciar para no tapar el botón.
- **Evidencia:** web 1396/1396 (lote 31/31, incluido el inicio rechazado con 4xx sin modo demo), typecheck y build limpios; revisión de fiabilidad sin bloqueos, sus hallazgos corregidos en `bb42b55`.

### 7.14. Modo foco: una serie a la vez (2026-10-11, `dfc3e51` y `0194fcb`)
- **Decisión del dueño:** al iniciar no se abruma al alumno con toda la lista; se enfoca la serie actual, con lo que queda del ejercicio y el siguiente ejercicio, y la lista completa queda a un toque. Detalle y alternativas en [[ADR-021-modo-foco-entrenamiento-alumno]].
- **Mecanismo:** `lib/modo-foco.ts` decide la serie en foco (primera pendiente en orden o, tras **"Hacer ahora"**, la del ejercicio elegido, siguiendo después por los posteriores y en bucle) y los textos ("Ejercicio 2 de 5 · Serie 3 de 4", "Quedan 3 series de este ejercicio", "Siguiente: …"). `ModoFoco` pinta una sola serie con la misma fila que la lista (`renderFilaSerie`): filtros, borradores, envío y cola offline son los mismos. Con todo hecho muestra "Completaste todas las series" y "Finalizar entrenamiento" sigue disponible.
- **Lista completa:** "Ver entrenamiento completo" muestra las series hechas compactas y las pendientes; "Hacer ahora" por ejercicio y "Volver al enfoque". La cabecera de cada tarjeta se apila en móvil (título sin cortar, badge de descanso de 12 px sin partirse).
- **Errores y accesibilidad:** un rechazo del servidor sobre una serie que no está en foco se avisa también en el banner superior; el cronómetro solo se cierra si era el de la serie rechazada; el bloque visible del progreso es una región viva que anuncia cada avance.
- **Evidencia:** web 1448/1452 (los 4 rojos son de la conciliación de RF-006/007, en curso en otra sesión), lote y página 66/66 (incluye rechazo 4xx sin modo demo), typecheck y build limpios; revisión de fiabilidad sin bloqueos, sus hallazgos corregidos en `0194fcb`.

### 7.15. Cierre de pendientes del módulo (2026-10-12, `63369d7`)
- **Pegar con unidad:** pegar `'60 kg'`, `'60,5 kg'` o `'135 lb'` en un campo de peso (alumno, entrenador y ajustes de asignación) escribe el número (`extraerNumeroPegado`); un texto con otra cosa (`'2x20 kg'`) sigue sin escribirse.
- **"Hacer ahora" persistente:** el ejercicio elegido se guarda en `sessionStorage` por sesión y se aplica **desde el primer render** al recargar (se deriva en el render, sin parpadeo del ejercicio 1); si el navegador bloquea el almacenamiento, vive solo en memoria (`lib/sesion-estado.ts`).
- **Copia inmutable:** los handlers de series (`handleToggleSet`, `handleUpdateSerieValue`, `handleStepSerieValue`) trabajan sobre `clonarSesionParaEdicion` y ya no mutan el estado anterior.
- **Sesión en curso desde la caché:** cubierta con un spec sin conexión (Dexie): muestra el modo foco y no llama al API.
- **Evidencia:** web 1575/1575 (lote 265/265), typecheck y build limpios.
- **Límite aceptado del pegado:** se escribe el número en la unidad visible, sin convertir. `'135 lb'` pegado con la unidad en kg escribe 135 kg (decisión del dueño, 2026-10-12).
- **Revisión de fiabilidad (2026-10-12, `7ca9fcf`):** aprobada con observaciones; se corrigieron dos.
  - **Rechazo con edición en vuelo:** si el servidor rechaza una serie, solo se revierten `completada`, `timestampCompletadaUtc` y `descansoSegundos`. El peso, las reps y el RPE que el alumno editó mientras el envío estaba en vuelo se conservan.
  - **Pegado en los ajustes de asignación:** `'60 kg'` solo se interpreta en Peso (ver RF-017 §6).
  - **Tests nuevos:** rama "no cerrar" del cronómetro (un rechazo de otra serie no cierra el vigente), bordes del peso corporal (`'300,1'`), formatos de pegado no válidos y preferido fuera de rango.
  - **Evidencia:** web 1585/1585, typecheck y build limpios.

### 7.16. Fila editable de la serie como componente (2026-10-12, `f4bcda1`)
- **`FilaSerieEdicion`** (`components/atleta`) es la fila editable que comparten el modo foco y la lista completa.
  - **Componente:** es presentacional. Lleva los filtros de entrada, los steppers, el marcado, "Iniciar serie", el descanso real y el error inline.
  - **`renderFilaSerie`:** sigue calculando los borradores, los errores y los valores mostrados, y decide si la serie se ve compacta (`FilaSerieCompletada`).
  - **Sin cambio de comportamiento:** lo verificó una comparación mecánica del JSX y del preámbulo contra el código anterior.
- **Borrador de repeticiones:** al marcar una serie se descarta también el borrador de reps, como ya pasaba con el de peso y el de esfuerzo. Si el alumno vació el campo y marcó sin salir de él, al reabrir la corrección ve el valor enviado y no el campo vacío.
- **Textos:** la fila deja de usar 11 px ("Listo", "Iniciada …" y "Descanso real" pasan a 12 px), como el resto de `components/atleta`.
- **Evidencia:**
  - specs del componente y del borrador de reps (vaciar y salir, stepper con el campo vacío, completar con y sin salir del campo);
  - web 1624/1624, typecheck y build limpios;
  - revisión de legibilidad aprobada con observaciones, sus hallazgos corregidos en el mismo commit.

### 7.17. Orden de los envíos de una sesión (2026-10-15, `a4371fe`, lote E9)
- **Problema (Judgment Day de diseño, 2026-10-12):** un envío directo en vuelo podía llegar después de un cambio encolado posterior de la misma sesión (marcar y desmarcar con mala señal dejaba la serie marcada); un directo que fallaba se re-encolaba con la hora del fallo; finalizar se adelantaba a series en vuelo; y un rechazo tardío deshacía un toque posterior.
- **Decisiones del dueño:** el orden se garantiza dentro del dispositivo, y con red lenta el segundo cambio puede verse unos segundos como "por enviar" (2026-10-12). El rechazo tardío de un toque ya superado no se avisa: opción A (2026-10-15).
- **Mecanismo** ([[ADR-024-orden-envios-sesion-entrenamiento]]):
  - con un envío directo de la sesión en vuelo, el cambio siguiente se encola detrás, y la cola no saca nada de esa sesión hasta que el vuelo termina;
  - todo lo encolado lleva la hora de la acción;
  - el directo tiene un plazo de 15 s y, si vence, se re-encola con la misma clave;
  - un rechazo tardío solo revierte si el toque sigue siendo el último de su serie;
  - el porcentaje y la racha se recalculan del estado actual.
- **Límite:** el orden se garantiza dentro de la misma pestaña; varias pestañas o dispositivos no se coordinan.
- **Evidencia:**
  - web 2130/2130, typecheck y build sin errores; el test U8, antes inestable, pasa 30/30;
  - revisión con las 4 lentes (riesgo, fiabilidad, resiliencia y legibilidad) APTA, sin bloqueos, y sus avisos corregidos en el mismo commit.

### 7.18. Monitor de adherencia táctil y honesto (2026-10-30, `da5c851`, lote UX-14)
- La tarjeta ya no es un `article` clicable. El nombre es el botón que abre la actividad reciente, con un enlace extendido que cubre la tarjeta. El chevron a la ficha y "Ver últimas sesiones en detalle" son controles reales de 44px. Los nombres largos ocupan hasta dos líneas.
- El estado usa `BadgeEstado`. El punto rojo solo parpadea sin movimiento reducido (`motion-safe:`). Se lee "Última sesión:" y la racha solo aparece si es mayor que 0.
- Los chips del semáforo usan `ChipFiltro` dentro del grupo "Filtrar por estado", con etiquetas cortas y conteo ("Todos 5", "En riesgo 1", "En observación 1", "Al día 1", "Sin plan 1"). "Actualizar" usa `BotonTactil` y el buscador mide 44px, con texto de 16px en el móvil.
- La paginación también aparece al pie ("Paginación al final de la lista", sin repetir el anuncio para el lector de pantalla gracias a las props nuevas `etiqueta` y `anunciarEstado` de `common/Paginacion`).
- Una recarga fallida con datos no tapa la lista: muestra `AvisoErrorRecarga` y conserva los filtros. Sin conexión: con datos, "Sin conexión · datos guardados"; sin datos, "Sin conexión y sin datos guardados". Los estados de carga, error y filtros sin resultados usan los átomos de `ui/`.
- Evidencia: web **2793 tests en 299 archivos**: la suite completa solo falló en MP6, por un contrato mal escrito; tras corregirlo, el lote dio 45/45. Typecheck y build en verde. Revisión de fiabilidad sin BLOCKER; se corrigieron el anuncio duplicado de la paginación, los iconos sin `aria-hidden` y un comentario.
- Pendiente: con un error, el estado vacío de filtros se oculta (ya ocurría antes). En modo demo y sin conexión se muestra "sin datos", porque TanStack pausa también la consulta demo. Falta un test del clic en la paginación del pie. `ModalActividadAlumno` mantiene un `animate-pulse` sin `motion-safe`.

### 7.19. Revisión UX: aviso legible al cerrar la sesión y menú honesto (`af33433`, 2026-11-03, revisión de UX-19 a UX-29)
- **Aviso de series pendientes legible (`ModalFinalizarSesion`):** usaba `text-warning-foreground` sobre `bg-warning/10`, casi blanco en tema claro y azul marino en oscuro, así que la advertencia central del cierre no se leía. Ahora usa `text-warning` con el icono de alerta; el guardián `estilo-contraste-advertencia.spec.ts` impide volver a combinar ambos tokens.
- **Menú del alumno:** `derivarEstadoEntrenamientoHoy` dice «Completado hoy» solo si el bloque sugerido de hoy está completado; con la semana completa y hoy sin entrenar dice «Semana completada».
- **Iconos de estado de los chips de la semana:** los que acompañan un texto visible llevan `aria-hidden`; el completado y el activo se dejan expuestos porque son la única señal de su estado.
- **Evidencia:** 3 tests nuevos en `use-resumen-menu.revux.spec.ts` y 1 guardián; web **3074/3074** en 351 archivos.

### 7.20. El día del alumno se calcula con la zona del perfil (`6da5794`, 2026-11-03, lote ZH-2, [[ADR-025-zona-horaria-alumno-precarga-dispositivo-aviso-discrepancia]])
- El menú del alumno (`use-resumen-menu.ts`) y el «Hoy» del entrenamiento (`use-entrenamiento.tsx`) toman el día de la zona horaria del perfil (`useZonaPerfil()` y `fechaCalendarioEnZona`) y no de la del dispositivo. De ahí lo heredan la semana, la carga de la sesión, las acciones y la lectura de la caché offline de la rutina de hoy, así que todos coinciden en qué día es.
- Si la zona del perfil es nula o inválida se usa `America/Caracas`. En el modo demo el «hoy» sigue siendo el reloj del dispositivo. El entrenador no cambia: usa la zona de su dispositivo.
- Siguen con la zona del dispositivo la agrupación «Hoy/Ayer» de las notificaciones y los endpoints `?timezone=` del entrenamiento, que aceptan lo que envía el cliente.
- **Evidencia:** web **3152/3152** en 376 archivos; typecheck y build con código 0.

### 7.21. Cronómetro de descanso con tiempo absoluto y borrador de series (`8bcfa95`, 2026-11-04, [[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]])
- **Acceso con botón flotante y animaciones** (`24d506f` y `4a84375`, 2026-11-04, [[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]] §8): ver el último bloque de esta sección.
- **Cronómetro como widget** (RN-06):
  - Estado con `finEnMs` (instante de fin absoluto) persistido por sesión en `localStorage` (`guachafit_cronometro_<sesionId>`). Al volver a la pestaña (`visibilitychange` y `pageshow`) recalcula el tiempo restante.
  - Píldora y panel expandido, con anillo o barra de progreso; `role="timer"`, aviso de fin en región `aria-live`, área segura (safe-area), áreas táctiles de 44 px y foco visible. Código en `lib/cronometro-descanso.ts`, `use-cronometro-descanso.ts`, `lib/aviso-descanso.ts` y `components/common/RestTimer*.tsx`.
  - Duración acotada a 10 s–10 min; el estado caduca a las 6 h.
- **Defectos corregidos:**
  1. El cronómetro cerrado seguía sonando.
  2. El botón «Descanso» de la cabecera (el acceso de entonces, sustituido después por el botón flotante) abría un cronómetro «libre» y «+30» reescribía el `descansoSegundos` de la última serie marcada.
- **Cuándo se envía `descansoSegundos`** (RN-07): solo por ±15 s o un preset sobre un cronómetro con serie vigente, con espera de 1 s y el valor final. El cronómetro «libre» (el del botón flotante sin serie vigente; antes, el de la cabecera) nunca envía; pausar, reanudar y reiniciar tampoco. El ajuste pendiente al cambiar de sesión se entrega a la sesión original. Si la serie ya no existe, no se envía nada. En modo demo no se escribe ni se envía.
- **Higiene del almacenamiento:** `limpiarClavesEntrenamientoLocal` borra por prefijo `guachafit_cronometro_*` en el logout, en el cambio de usuario y en `cerrarSesionPorVencimiento`. La sesión vencida no toca IndexedDB ni la cola offline (§7.10).
- **Borrador de series** (RN-08): sin segundo almacén. Lo tecleado ya se guardaba en la copia local (`offlineDb.rutinaHoy`); ahora `combinarSeriesPendientesLocales(servidor, local)` lo vuelca sobre la sesión del servidor al cargar, antes de `cacheSesion`.
  - Solo series con `completada === false` en ambas copias, con el mismo `id` de sesión y el mismo `alumnoId`.
  - Cada valor se valida con el contrato compartido (§7.11: peso hasta 999,99 kg con 2 decimales como máximo, repeticiones enteras dentro del tope, esfuerzo dentro de su rango). Un valor inválido o vacío conserva el del servidor.
  - Una copia local corrupta no impide cargar: se usan los datos del servidor. En series completadas gana el servidor.
  - «Sumar» y «Restar» de repeticiones parten del valor restaurado.
- **Límite entre dispositivos:** en una serie pendiente prevalece lo tecleado en el dispositivo actual, porque no se envía al servidor hasta pulsar «Listo». Se descartó comparar marcas de tiempo: enfrentaría el reloj del móvil con el del servidor y, con un móvil atrasado, el borrador se perdería sin aviso.
- **Evidencia:** 111 tests del lote; suite web completa **3329/3329**; typecheck y build sin errores. Revisiones con las 4 lentes (riesgo, fiabilidad, resiliencia y legibilidad): hallazgos aceptados y corregidos; se rechazó, con razón, la regla de marcas de tiempo para el borrador. Un spec existente (`EntrenamientoPage.reps.interaccion.spec.tsx`) limpia `offlineDb.rutinaHoy` entre tests porque el borrador ahora se lee al cargar.
- **No verificado y fuera de alcance:**
  - El comportamiento real en **iOS Safari** no se probó en dispositivo: no hay vibración, el audio depende de un gesto del usuario y del interruptor de silencio, y el JavaScript se congela con la pantalla bloqueada. El recálculo del temporizador no usa Wake Lock.
  - La auditoría de contraste de los controles nuevos no se midió.
  - Seguimientos abiertos (ver [[Handoff_Entrenamiento_Pendientes]]): precarga del peso con el plan; repeticiones prellenadas con el objetivo (se envía `repsLogradas ?? repsObjetivo`, un dato que parece real); desmarcar una serie sin confirmación ni deshacer; `enterKeyHint` y seleccionar el contenido al enfocar los inputs; campo de notas del modal de cierre con `text-xs` (zoom en iOS) y etiquetas de 11 px; `aria-pressed` en «Listo»; deshabilitar «Restar 15 segundos» con el descanso ya terminado; avisar también en la píldora (no solo en el panel) que con la pantalla bloqueada no suena.
  - Sincronizar el cronómetro entre pestañas se descartó por YAGNI.
- **Botón flotante del cronómetro y animaciones** (`24d506f` y `4a84375`, 2026-11-04; escenario 9, RN-06 y ADR-027 §8):
  - **Mecanismo:** `RestTimerFab` y `RestTimer` montan un único widget con tres estados (reposo, píldora y panel) en un portal sobre `document.body`, con `z-[45]` y área segura; la página reserva margen inferior mientras el botón es visible. La cabecera conserva solo el selector kg/lb. El toque abre el descanso libre en pausa a 90 s con el foco en «Reanudar descanso» y no envía `descansoSegundos`; marcar una serie abre la píldora en marcha sin robar el foco. Solo es visible con la sesión en curso y sin modal propio abierto; ocultarlo no cierra el cronómetro.
  - **Movimiento:** entrada con las variantes `starting:` de Tailwind v4; salida de 150 ms (`ease-in`) solo al cerrar, con la última vista congelada (`use-capa-saliente-cronometro.ts`), `aria-hidden`, `inert` y sin «0:00»; píldora ↔ panel y ocultar por modal, instantáneos; fin del descanso con `animate-destello-fin` (2 repeticiones) en lugar de `animate-pulse`. La regla global de §6.16 sigue siendo única y lo último de `index.css`.
  - **Dependencia nueva `tw-animate-css@1.4.0`** (MIT, sin dependencias ni scripts; importada en `index.css`). El código ya usaba 60 veces `animate-in`, `fade-in`, `zoom-in-95` y `slide-in-from-*` (todos los modales y paneles, 49 archivos), pero Tailwind v4 no las trae y no producían ninguna animación. `animate-fade-in` (`AppLayout`, en el `<main>` de todas las pantallas) no la definía nadie: ahora vive en `index.css` y anima solo la opacidad, porque con `transform` rompería lo `fixed` dentro del `<main>`. **Efecto global:** ahora todos los modales y vistas con esas clases se animan al entrar. No hay `animate-out`, `fade-out` ni `zoom-out` en el código: los modales siguen desmontándose de golpe al cerrar.
  - **Evidencia:** lote 88/88; suite web completa **3.372/3.372**; typecheck y build sin errores. Revisión de fiabilidad: 0 BLOCKER, 4 WARNING (2 corregidos y 2 rechazados con razón) y 3 SUGGESTION (2 anotadas como seguimiento y 1 aceptada). Corregidos: la instantánea de la capa saliente solo se refresca cuando cambia algo visible, y la intención «abierto por el botón» caduca si el toque no abre el cronómetro.
  - **No verificado en dispositivo:**
    1. `animate-in` aplica un `transform` durante la entrada (unos 300 ms) y eso crea un bloque contenedor para descendientes `fixed`: un modal `fixed inset-0` sin portal, colgado de una página con `animate-in fade-in duration-300` (el revisor citó `AlumnoDetallePage`, `AlumnosPage`, `PagosPage` y `ModalPlanComercial`), quedaría confinado si se abre dentro de esa ventana.
    2. El panel expandido (unos 300 px) puede tapar el input que se edita cuando sube el teclado móvil (`index.html` no declara `interactive-widget`).
    3. El aspecto real del movimiento, iOS, la vibración y el audio no se probaron en un iPhone.
  - **Seguimientos:** plegar el panel al enfocar un input o declarar `interactive-widget`; portalizar esos modales o evitar el `transform` de la entrada; `animate-out` y salida de los modales; y los de la lista anterior (deshabilitar «Restar 15 segundos» con el descanso terminado y avisar en la píldora de la pantalla bloqueada).

### Pendiente
- Ninguno abierto de §7.10. El uso desde varias pestañas o dispositivos queda como límite documentado (ver §7.17 y §7.21).
- Seguimientos de §7.21: los listados arriba en «No verificado y fuera de alcance», los del botón flotante (plegar el panel con el teclado, modales dentro de páginas con `animate-in`, `animate-out` en los modales) y la prueba en un iPhone real.

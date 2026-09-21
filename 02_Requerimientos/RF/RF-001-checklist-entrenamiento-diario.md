---
id: RF-001
modulo: Entrenamiento
prioridad: alta
estado: implementado
version_implementada: v1.2.0
fecha_verificacion: 2026-09-20
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

---

## 6. Casos Borde y Excepciones
- **Uso sin conexión (Offline-first):** Si el alumno entrena en un sótano o gimnasio sin señal de datos, el cliente móvil/PWA debe cachear localmente las series y sincronizarlas al detectar conexión.
- **Entrenamientos fuera de día planificado:** Permitir al alumno ejecutar una sesión aplazada o adelantar un día sin romper la integridad del historial.

---

## 7. Notas de Implementación (v1.2.0)

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

### 7.4. Cola offline (PWA)
- Las mutaciones encoladas de forma durable se reintentan con backoff; los errores `4xx` se muestran como rechazadas (requieren acción del alumno) y los `5xx`/fallos de red se reintentan.
- Cada ítem de la cola viaja con su propia `X-Idempotency-Key`, complementada por el dedupe server-side.

### 7.5. Monitor semanal del coach (RN-03)
- `GET /entrenador/monitor-adherencia?timezone=` evalúa la ventana Lunes 00:00 local → ahora.
- `tienePlanActivo = false` → "sin plan" (nunca rojo); `sinPendientesSemana = true` → "Al día — sin pendientes" (nunca rojo).
- Orden por riesgo (rojo primero) y enlace al expediente del alumno vía `alumnoPerfilId`.

### 7.6. Límites conocidos de la entrega
- Caché de idempotencia en memoria (§7.3).
- RLS multi-tenant por etapas: ver [[RNF-003-aislamiento-multitenant-seguridad-datos-salud]].
- Verificación visual manual pendiente en algunas pantallas móviles (layout/accesibilidad del modal de video y hints); no afecta la funcionalidad.

### 7.7. Medición del descanso real (WU17)
- **Fórmula:** `descanso_real = timestamp_inicio_utc(serie siguiente) − timestamp_completada_utc(serie anterior)` (misma fórmula entre ejercicios: inicio de la primera serie del siguiente − completada de la última del anterior). `series_registro.timestamp_inicio_utc` se captura sin fricción al interactuar con la serie (peso/reps/RPE) o con el botón "Iniciar serie", una sola vez y solo en series pendientes de una sesión `EnProgreso`; las series ya completadas nunca se retro-marcan y el prefill programático no la dispara.
- **UI:** con marcas se muestra "Descanso real" y "Ejecución" (fin − inicio); sin marcas se conserva el Δ entre marcas de WU15 (cota superior) o "—". Nunca se muestran valores negativos.
- **Límite honesto:** la precisión depende de que el alumno marque el inicio; sin marca no se inventa la medición y `descansoSegundos` sigue siendo el valor del temporizador (objetivo), no el descanso efectivo.

### 7.8. Listados server-side (WU24–WU26)
- Monitor de adherencia con búsqueda (`q`), semáforo y orden (`riesgo | nombre`) server-side y paginación `{ items, total, limit, offset, resumen }` (`limit` default 25, techo 100); historial de sesiones del alumno paginado en `GET /sesiones/alumno/{alumnoId}/historial` (`limit` default 30, techo 100). El `total` del historial y el `resumen` del monitor son siempre reales (nunca del slice de página); el detalle de contrato vive en [[03_Contratos_API_Especificacion]] §1.1 y §4.1.

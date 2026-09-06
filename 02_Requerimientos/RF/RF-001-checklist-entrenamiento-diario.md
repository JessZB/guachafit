---
id: RF-001
modulo: Entrenamiento
prioridad: alta
estado: aprobado
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

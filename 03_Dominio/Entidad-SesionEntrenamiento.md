---
entidad: SesionEntrenamiento
modulo: Entrenamiento
tipo: AggregateRoot
estado_ciclo_vida: activo
fecha_creacion: 2026-09-05
tags:
  - dominio
  - ddd
  - entidad
  - entrenamiento
---

# Entidad de Dominio: SesionEntrenamiento

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Representa la instancia diaria planificada y ejecutada de una rutina de ejercicios asignada a un alumno.

- **Definición de negocio:** Unidad operativa de entrenamiento donde el alumno registra el cumplimiento de series, repeticiones logradas y peso levantado por ejercicio.
- **Clarificación Terminológica Crítica:**
  - `Login / Autenticación de Usuario (Iniciar sesión en la app)`: Acción de acceso a la cuenta. Es un proceso de solo lectura para consultar rutinas, historial o métricas sin generar efectos colaterales ni transiciones de estado en la rutina.
  - `Comenzar Entrenamiento (comenzarEntrenamiento)`: Acción explícita e intencional dentro de la rutina donde el alumno indica formalmente al sistema que empieza la sesión física de ejercicio (transición de `Planificada` a `EnProgreso`).
- **Términos del Dominio:**
  - `Checklist de Ejercicio`: Desglose secuencial de tareas físicas a completar.
  - `Serie Efectiva`: Conjunto de repeticiones realizadas con una carga específica.
  - `Racha (Streak)`: Días consecutivos o ciclos semanales cumplidos exitosamente.
- **Bounded Context:** Contexto de Planificación y Ejecución de Entrenamiento.

---

## 2. Atributos Clave (Schema de Dominio)

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Sí | Identificador único inmutable | UUID v4 |
| `alumno_id` | `UUID` | Sí | Referencia al alumno | UUID v4 |
| `rutina_id` | `UUID` | Sí | Rutina origen prescrita por el coach | UUID v4 |
| `fecha_programada`| `Date` | Sí | Fecha calendario de la rutina | YYYY-MM-DD (Fecha local del alumno) |
| `fecha_inicio_utc` | `DateTime` | No | Timestamp exacto al pulsar "Comenzar Entrenamiento" | ISO 8601 UTC (`...Z`) |
| `fecha_fin_utc` | `DateTime` | No | Timestamp exacto al pulsar "Finalizar Entrenamiento" | ISO 8601 UTC (`...Z`) |
| `timezone_cliente`| `String` | Sí | Zona horaria del dispositivo del alumno | Formato IANA (ej. `America/Caracas`) |
| `ejercicios` | `List<EjercicioEjecutado>` | Sí | Colección de ejercicios y series | Al menos 1 ejercicio |
| `estado` | `EnumEstadoSesion` | Sí | `Planificada`, `EnProgreso`, `Completada`, `Omitida` | Máquina de estados |
| `porcentaje_cumplimiento` | `Decimal` | Sí | Cálculo automático de volumen cumplido | $0.0\%$ a $100.0\%$ |

---

## 3. Invariantes de Negocio (Business Invariants)
- **INV-01 (Umbral de Completitud para Racha):** Una sesión solo transiciona a `Completada` y genera crédito de racha si el `porcentaje_cumplimiento` es igual o superior al $70\%$.
- **INV-02 (Inmutabilidad Post-Cierre):** Una vez que la sesión alcanza el estado `Completada`, los datos de cargas y repeticiones no pueden ser alterados por el alumno sin autorización del entrenador (para preservar la auditoría de sobrecarga progresiva).
- **INV-03 (Cargas no Negativas):** Ninguna repetición o peso registrado puede ser inferior a 0.
- **INV-04 (Persistencia Estricta en UTC y Contexto Local):** Todos los timestamps (`fecha_inicio_utc`, `fecha_fin_utc`) deben almacenarse exclusivamente en formato UTC (ISO 8601 con sufijo `Z`). El frontend del dispositivo cliente es el único responsable de renderizar dichos valores convertidos a la hora local del navegador/dispositivo. La pertenencia de la sesión a un día calendario se evalúa respecto a la fecha local del alumno (`fecha_programada` + `timezone_cliente`).

---

## 4. Relaciones y Límites de Agregado
- **Raíz del Agregado:** `SesionEntrenamiento`.
- **Entidades Contenidas:**
  - `EjercicioEjecutado` (Entidad interna identificada por `ejercicio_id`).
  - `SerieRegistro` (Value Object con: `numero_serie`, `reps_objetivo`, `reps_logradas`, `peso_kg`, `completada: boolean`).

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `comenzarEntrenamiento(timezoneCliente)`: Acción intencional disparada cuando el usuario pulsa *"Comenzar a entrenar"*. Valida que la sesión esté en estado `Planificada`, transiciona a `EnProgreso`, registra `fecha_inicio_utc = DateTime.now_utc()` y almacena `timezone_cliente`. *(Nota: Acceder a la app o visualizar la rutina NO invoca este método).*
- `marcarSerie(ejercicioId, numeroSerie, reps, peso)`: Registra el checklist en tiempo real para una serie ejecutada.
- `finalizarEntrenamiento()`: Disparada cuando el usuario pulsa *"Finalizar Entrenamiento"*. Registra `fecha_fin_utc = DateTime.now_utc()`, calcula el porcentaje de completitud, evalúa si cumple la regla de racha (INV-01), transiciona a `Completada` y emite `SesionEntrenamientoCompletadaEvent`.
- `pausarOReanudar()`: Permite manejar pausas operativas dentro de la sesión activa sin reiniciar el timestamp de inicio.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `SesionEntrenamientoIniciadaEvent`: Emitido al pulsar *"Comenzar a entrenar"*; puede notificar al entrenador en tiempo real de que el alumno está en el gimnasio.
- `SesionEntrenamientoCompletadaEvent`: Notifica la finalización, actualiza la racha del alumno y refresca el semáforo semanal del entrenador.

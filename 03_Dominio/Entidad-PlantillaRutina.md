---
entidad: PlantillaRutina
modulo: Entrenamiento
tipo: AggregateRoot
estado_ciclo_vida: activo
fecha_creacion: 2026-09-20
tags:
  - dominio
  - ddd
  - entidad
  - entrenamiento
  - plantillas
  - rutinas
---

# Entidad de Dominio: PlantillaRutina

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Plantilla de entrenamiento reutilizable que vive en el banco privado de un entrenador y sirve como origen de copia profunda hacia la rutina semanal de uno o varios alumnos.

- **Definición de negocio:** Estructura modular de días y ejercicios (series, repeticiones, carga prescrita, RPE y notas) prediseñada por el coach para asignarla individual o masivamente sin volver a prescribir ejercicio por ejercicio.
- **Términos del Dominio:**
  - `Banco de Plantillas`: catálogo privado por entrenador (tenant); una plantilla nunca es visible para otro coach.
  - `Copia Profunda (Deep Clone)`: al asignar, los bloques se clonan a la rutina del alumno; la plantilla y las rutinas ya prescritas quedan desacopladas en ambos sentidos.
  - `Modo de Asignación`: `REEMPLAZAR` (sustituye la rutina activa del alumno) o `FUSIONAR` (anexa los días a los bloques existentes).
  - `Ajuste Previo`: override puntual de carga/series/reps/RPE aplicado antes de confirmar la asignación.
- **Bounded Context:** Contexto de Prescripción y Gestión de Entrenamiento.

---

## 2. Atributos Clave (Schema de Dominio)

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Sí | Identificador único inmutable | UUID v4 |
| `entrenador_id` | `UUID` | Sí | Entrenador propietario (Tenant) | FK a `usuarios.id`, `ON DELETE CASCADE` |
| `nombre` | `string` | Sí | Nombre de la plantilla (ej. *Torso Potencia - Fase 1*) | 3 a 120 caracteres |
| `nivel_objetivo` | `EnumNivelObjetivoPlantilla` | Sí | Público objetivo de la plantilla | `principiante`, `intermedio`, `avanzado` |
| `bloques` | `List<BloqueDiaRutinaDTO>` (JSONB) | Sí | Días con ejercicios, series, reps, peso prescrito, RPE y notas | 1 a 7 bloques; cada bloque con al menos 1 ejercicio |
| `activa` | `boolean` | Sí | Soft delete / visibilidad en la biblioteca | Default `true` |
| `created_at_utc` | `DateTime` | Sí | Timestamp de creación | ISO 8601 UTC |
| `updated_at_utc` | `DateTime` | Sí | Timestamp de última modificación | ISO 8601 UTC |

---

## 3. Invariantes de Negocio (Business Invariants)
- **INV-01 (Aislamiento de Tenancy):** Toda plantilla pertenece a exactamente un `entrenador_id`; listar, editar, desactivar o asignar una plantilla de otro tenant retorna `404 Not Found`.
- **INV-02 (Copia Profunda Bidireccional):** La asignación clona los bloques a la rutina del alumno. Modificar la plantilla después no altera rutinas ya prescritas, y ajustar la rutina de un alumno no modifica la plantilla base (RF-017 RN-02).
- **INV-03 (Integridad de Asignación):** Cada bloque debe contener al menos un ejercicio y los ejercicios referenciados deben existir en el catálogo global o privado del coach.
- **INV-04 (Soft Delete):** Desactivar una plantilla (`activa = false`) la oculta de nuevas asignaciones sin destruir el histórico; las rutinas ya clonadas permanecen intactas.

---

## 4. Relaciones y Límites de Agregado
- **Raíz del Agregado:** `PlantillaRutina`.
- **Entidades Hijas / Value Objects contenidos:**
  - `BloqueDiaRutina` (1 a 7, serializado en `bloques JSONB`).
  - `EjercicioPlantilla` (con series, reps, peso prescrito, RPE y notas técnicas).
- **Referencias externas:** `entrenador_id` (tenant), ejercicios del catálogo (`ejercicio_id` o `nombre`) y, tras la asignación, la rutina destino del alumno en `rutinas` (nunca acoplamiento directo de instancia).

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `crear(nombre, nivelObjetivo, bloques)`: valida INV-01, INV-03 y persiste la plantilla en estado `activa`.
- `actualizar(nombre, nivelObjetivo, bloques, activa)`: modificación atómica de los metadatos y bloques de la plantilla.
- `desactivar()`: soft delete (`activa = false`) preservando el histórico (INV-04).
- `asignarA(alumnoIds, modo, ajustes)`: clona los bloques (deep clone) a la rutina de cada alumno aplicando los ajustes previos; responde un reporte de éxito/fallo por alumno sin abortar el resto de la operación.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- *(Ninguno en la entrega actual.)* La asignación es síncrona y devuelve `AsignacionPlantillaResponseDTO` con el reporte por alumno; no emite eventos de dominio.

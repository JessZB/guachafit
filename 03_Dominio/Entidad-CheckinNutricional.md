---
entidad: CheckinNutricional
modulo: Nutricion
tipo: AggregateRoot
estado_ciclo_vida: activo
fecha_creacion: 2026-09-05
tags:
  - dominio
  - ddd
  - entidad
  - nutricion
---

# Entidad de Dominio: CheckinNutricional

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Registro ágil de cierre diario de alimentación que evalúa la adherencia general sin imponer el pesaje gramo a gramo.

- **Definición de negocio:** Reporte diario emitido por el alumno que sintetiza su comportamiento alimentario frente a la meta pautada por el entrenador.
- **Términos del Dominio:**
  - `Semáforo Nutricional`: Indicador cualitativo rápido (`Cumplido`, `Parcial`, `NoCumplido`).
  - `Diario Fotográfico`: Registro visual de platos principales.
  - `Totales Externos`: Cifra agregada de calorías y proteínas extraída por el alumno de apps de terceros.
- **Bounded Context:** Contexto de Planificación y Seguimiento Nutricional.

---

## 2. Atributos Clave (Schema de Dominio)

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Sí | Identificador único inmutable | UUID v4 |
| `alumno_id` | `UUID` | Sí | Alumno propietario del registro | UUID v4 |
| `fecha` | `Date` | Sí | Día correspondiente al reporte | YYYY-MM-DD (Único por alumno y fecha) |
| `semaforo` | `EnumSemaforoNutricional` | Sí | `Cumplido`, `Parcial`, `NoCumplido` | Selección 1-Tap |
| `fotos_platos` | `List<FotoComida>` | No | Fotos de desayuno, almuerzo, etc. | Entre 0 y 4 imágenes |
| `totales_reportados` | `TotalesMacros` (VO) | No | Calorías y Proteínas opcionales | Calorías $\ge 0$, Proteína $\ge 0$ |
| `agua_litros` | `Decimal` | No | Consumo aproximado de agua | $0.0$ a $15.0$ L |
| `notas_alumno` | `String` | No | Comentarios u observaciones del día | Máximo 280 caracteres |

---

## 3. Invariantes de Negocio (Business Invariants)
- **INV-01 (Unicidad Diaria):** Solo puede existir un `CheckinNutricional` por `alumno_id` y `fecha`. Si el alumno reporta de nuevo antes de medianoche, se actualiza el registro existente en lugar de duplicarse.
- **INV-02 (Límite del Diario Fotográfico):** No se permiten más de 4 fotografías de platos por día para evitar sobrecostos de almacenamiento y fatiga visual del coach.

---

## 4. Relaciones y Límites de Agregado
- **Raíz del Agregado:** `CheckinNutricional`.
- **Value Objects:**
  - `TotalesMacros`: Objeto inmutable que almacena `calorias: integer` y `proteina_gramos: integer`.
  - `FotoComida`: Objeto inmutable con `tipo_comida` (Desayuno, Almuerzo, Cena, Snack) y `storage_key`.

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `reportarSemaforo(semaforo)`: Registro de 1-Tap.
- `adjuntarFotoPlato(tipoComida, storageKey)`: Agrega imagen validando el tope máximo de 4.
- `registrarTotalesExternos(calorias, proteina)`: Persiste macros opcionales y compara automáticamente con el objetivo del coach.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `CheckinNutricionalCompletadoEvent`: Emitido al registrar el semáforo diario; alimenta los reportes de adherencia semanal del entrenador.

---
entidad: ControlAntropometrico
modulo: Antropometria
tipo: AggregateRoot
estado_ciclo_vida: activo
fecha_creacion: 2026-09-05
tags:
  - dominio
  - ddd
  - entidad
  - antropometria
---

# Entidad de Dominio: ControlAntropometrico

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Representa la fotografía biométrica y corporal de un alumno en un instante de tiempo específico. Contiene métricas físicas, composición tisular estimada y registros visuales.

- **Definición de negocio:** Evento periódico formal de evaluación corporal donde se capturan magnitudes anatómicas bajo condiciones estandarizadas (idealmente en ayunas).
- **Términos del Dominio:**
  - `Check-in`: Fecha de corte programada para la captura de mediciones.
  - `Origen Verificado`: Medición tomada presencialmente por las manos del entrenador.
  - `Autoreporte`: Medición tomada a distancia por el propio alumno.
- **Bounded Context:** Contexto de Evaluación Antropométrica y Salud.

---

## 2. Atributos Clave (Schema de Dominio)

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Sí | Identificador único inmutable | UUID v4 |
| `alumno_id` | `UUID` | Sí | Referencia al alumno evaluado | Llave foránea lógica |
| `fecha_evaluacion` | `Date` | Sí | Fecha de la medición | YYYY-MM-DD |
| `peso` | `MasaCorporal` (VO) | Sí | Peso del alumno | 30.0 kg a 300.0 kg |
| `altura` | `Longitud` (VO) | No | Altura (opcional si no cambia) | 100 cm a 250 cm |
| `perimetros` | `PerimetrosCorporales` (VO) | No | Cuello, pecho, cintura, cadera, brazo, muslo | Valores $> 0$ en cm |
| `composicion` | `ComposicionCorporal` (VO) | No | % Grasa o suma de pliegues cutáneos | $2.0\%$ a $65.0\%$ |
| `fotos` | `List<FotoProgreso>` | No | Frontal, Lateral, Posterior | Max 3 fotos referenciadas |
| `modalidad` | `EnumModalidad` | Sí | `Presencial` o `Remoto` | Control de flujo |
| `origen` | `EnumOrigen` | Sí | `PresencialVerificado` o `RemotoAutoreporte` | Auditoría |
| `registrado_por` | `UUID` | Sí | ID del usuario que grabó los datos | Entrenador o Alumno |
| `estado` | `EnumEstadoMedicion`| Sí | `PendienteAprobacion` o `Aprobado` | Máquina de estados |

---

## 3. Invariantes de Negocio (Business Invariants)
- **INV-01 (Consistencia de Origen y Autor):** Si `modalidad == Presencial`, obligatoriamente `origen == PresencialVerificado`, `registrado_por == entrenador_id` y `estado == Aprobado`.
- **INV-02 (Aprobación Requerida para Remoto):** Si `modalidad == Remoto` y `registrado_por == alumno_id`, el `estado` inicial DEBE ser `PendienteAprobacion`. No puede integrarse a las curvas de evolución oficiales hasta la aprobación del coach.
- **INV-03 (Límites Anatómicos Fisiológicos):** Ningún perímetro puede ser inferior a 10 cm ni superior a 250 cm. El valor del % de grasa no puede ser negativo ni exceder el 70%.

---

## 4. Relaciones y Límites de Agregado
- **Raíz del Agregado:** `ControlAntropometrico` es la raíz.
- **Value Objects internos:**
  - `PerimetrosCorporales`: Value object inmutable con las medidas anatómicas.
  - `FotoProgreso`: Value object que contiene `angulo` (Frontal/Lateral/Posterior), `storage_key` y `timestamp`.
- **Referencias externas:** Se asocia a `Alumno` y `Entrenador` exclusivamente mediante sus identificadores únicos (`alumno_id`, `entrenador_id`).

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `registrarPresencial(entrenadorId, datos...)`: Fabrica un control verificado directamente aprobado.
- `autoreportarRemoto(alumnoId, datos...)`: Fabrica un control en estado `PendienteAprobacion`.
- `aprobar(entrenadorId)`: Valida los datos y promueve el estado a `Aprobado`, disparando el evento de dominio correspondiente.
- `rechazarConObservaciones(entrenadorId, motivo)`: Marca el check-in para corrección y habilita de nuevo la ventana para el alumno.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `ControlAntropometricoRegistradoEvent`: Disparado cuando el alumno envía su check-in remoto.
- `ControlAntropometricoAprobadoEvent`: Disparado cuando el entrenador aprueba las medidas; actualiza los dashboards de salud y gráficos de progreso.

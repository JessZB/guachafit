---
entidad: NombreEntidad
modulo: Dominio
tipo: AggregateRoot # AggregateRoot | Entity | ValueObject | DomainEvent
estado_ciclo_vida: en_diseno # en_diseno | activo | deprecado
fecha_creacion: 2026-09-05
tags:
  - dominio
  - ddd
  - entidad
---

# Entidad de Dominio: {{entidad}}

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Definición canónica acordada entre expertos de negocio (entrenadores, analistas financieros) y el equipo de ingeniería.

- **Definición de negocio:** Concepto exacto e inequívoco de lo que representa esta entidad en el dominio.
- **Sinónimos o términos a evitar:** (ej. Evitar decir "Usuario" cuando el término de dominio es "Cliente" o "Atleta").
- **Bounded Context (Contexto Delimitado):** (ej. Gestión de Entrenamientos, Facturación y Cobranzas, Medición Antropométrica)

---

## 2. Atributos Clave (Schema de Dominio)
> Lista estructurada de campos, tipos primitivos o Value Objects que definen la entidad.

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` / `EntityId` | Sí | Identificador único e inmutable | Formato UUID v4 |
| `nombre` | `string` | Sí | Nombre descriptivo | 3 a 100 caracteres |
| `estado` | `EnumEstado` | Sí | Estado dentro de la máquina de estados | Valores controlados |
| `fecha_registro`| `DateTime` | Sí | Timestamp de creación | ISO 8601 UTC |

---

## 3. Invariantes de Negocio (Business Invariants)
> Reglas de consistencia que SIEMPRE deben ser verdaderas en cualquier punto del ciclo de vida de la entidad.

- **INV-01:** La entidad no puede transicionar a estado `Activo` si faltan los campos obligatorios X e Y.
- **INV-02:** Los cálculos derivados (ej. porcentaje de grasa corporal, total en divisa) deben satisfacer la fórmula Z.
- **INV-03:** Valores numéricos no pueden ser negativos o sobrepasar los límites fisiológicos/financieros.

---

## 4. Relaciones y Límites de Agregado
- **Límite del Agregado (Aggregate Boundary):** ¿Es la raíz del agregado o forma parte de uno externo?
- **Entidades Hijas / Value Objects contenidos:**
  - `ChildEntity` (1 a N)
  - `SpecificValueObject` (Inmutable)
- **Referencias externas:** Solo por ID (ej. `cliente_id: UUID`), nunca por acoplamiento directo de instancia en memoria.

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `crear(...)`: Factoría con validación de invariantes iniciales.
- `actualizarParametros(...)`: Modificación atómica de variables operativas.
- `cerrarCiclo(...)`: Transición de estado con emisión de eventos.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `EntidadCreadaEvent`: Payload emitido al persistirse por primera vez.
- `EntidadModificadaEvent`: Emite cambios relevantes para otros Bounded Contexts.

---
entidad: PlanMembresia
modulo: Finanzas
tipo: AggregateRoot
estado_ciclo_vida: activo
fecha_creacion: 2026-09-06
tags:
  - dominio
  - ddd
  - entidad
  - finanzas
  - membresias
---

# Entidad de Dominio: PlanMembresia

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Representa la oferta comercial estándar y las reglas de personalización contractual que vinculan a un alumno con el servicio del entrenador.

- **Definición de negocio:** Paquete de servicios de entrenamiento que define el precio base en divisa (USD), la periodicidad de cobro, los beneficios incluidos y las posibles condiciones especiales pactadas con un alumno en particular.
- **Términos del Dominio:**
  - `Plan Estándar`: Plantilla comercial del catálogo general.
  - `Override por Cliente`: Sobrescritura de atributos comerciales acordada de mutuo acuerdo.
  - `Tasa de Cambio Acordada`: Tipo de cambio preferencial congelado para un alumno específico.
- **Bounded Context:** Contexto de Planes Comerciales y Membresías.

---

## 2. Atributos Clave (Schema de Dominio)

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Sí | Identificador único inmutable | UUID v4 |
| `entrenador_id` | `UUID` | Sí | Propietario del plan comercial | UUID v4 |
| `nombre` | `string` | Sí | Nombre comercial del plan | 3 a 60 caracteres |
| `descripcion` | `string` | No | Alcance del servicio | Texto descriptivo |
| `beneficios` | `List<string>` | Sí | Checklist de prestaciones | Al menos 1 beneficio |
| `precio_base_usd` | `Decimal` | Sí | Tarifa estándar de catálogo | $> 0.00$ con 2 decimales |
| `duracion_meses` | `integer` | Sí | Periodicidad del ciclo | 1, 2, 3, 6 o 12 meses |
| `activo` | `boolean` | Sí | Disponibilidad en el catálogo | `true` o `false` |
| `overrides_clientes`| `List<OverrideCliente>` | No | Lista de personalizaciones por alumno | Clave única por `cliente_id` |

---

## 3. Invariantes de Negocio (Business Invariants)
- **INV-01 (Precios Positivos):** El `precio_base_usd` y cualquier `precio_acordado_usd` en overrides debe ser estrictamente $\ge 0.00$. Precios de $0.00$ requieren motivo explícito de beca.
- **INV-02 (Unicidad de Override por Alumno):** Un cliente no puede tener más de una regla de override activa simultáneamente para un mismo plan.
- **INV-03 (Inmutabilidad de Cuotas Emitidas):** Modificar el precio de un plan en el catálogo NO altera retrospectivamente las cuotas ya generadas o pagadas de ciclos anteriores.

---

## 4. Relaciones y Límites de Agregado
- **Raíz del Agregado:** `PlanMembresia`.
- **Value Objects Contenidos:**
  - `OverrideCliente`: Objeto inmutable compuesto por:
    - `cliente_id: UUID`
    - `precio_acordado_usd: Decimal?`
    - `tasa_fijada_override: Decimal?`
    - `beneficios_personalizados: List<string>?`

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `crearPlan(entrenadorId, nombre, precioBase, duracion, beneficios)`: Factoría para un nuevo plan en el catálogo.
- `aplicarOverride(clienteId, precioAcordado, tasaOverride, beneficiosExtra)`: Establece o actualiza las condiciones particulares para un alumno.
- `eliminarOverride(clienteId)`: Remueve las condiciones especiales, retornando al alumno al precio estándar de catálogo.
- `resolverPrecioYCondiciones(clienteId)`: Función pura que determina el precio final en USD, beneficios y tasa aplicable que deben inyectarse en la siguiente cuota.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `PlanMembresiaActualizadoEvent`: Notifica ajustes de precio o beneficios en el catálogo.
- `OverrideClienteEstablecidoEvent`: Notifica al módulo de cobranza la fijación de un precio o tasa especial para un alumno.

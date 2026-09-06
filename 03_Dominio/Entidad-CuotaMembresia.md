---
entidad: CuotaMembresia
modulo: Finanzas
tipo: AggregateRoot
estado_ciclo_vida: activo
fecha_creacion: 2026-09-06
tags:
  - dominio
  - ddd
  - entidad
  - finanzas
  - cuota
---

# Entidad de Dominio: CuotaMembresia

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Obligación de pago generada periódicamente para mantener activa la prestación de servicios del plan asignado a un alumno.

- **Definición de negocio:** Registro contable que consolida el importe adeudado en USD por un periodo de entrenamiento, acumulando los abonos verificados hasta su liquidación total.
- **Términos del Dominio:**
  - `Fecha de Corte`: Límite temporal programado tras el cual la cuota entra en mora si no está cubierta al 100%.
  - `Abono`: Fracción de pago en divisa o moneda local que disminuye el saldo pendiente.
  - `Saldo Pendiente`: Importe no cubierto expresado en USD y proyectado dinámicamente en Bolívares.
- **Bounded Context:** Contexto de Facturación y Cobranzas.

---

## 2. Atributos Clave (Schema de Dominio)

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Sí | Identificador único inmutable | UUID v4 |
| `cliente_id` | `UUID` | Sí | Alumno titular de la cuota | UUID v4 |
| `entrenador_id` | `UUID` | Sí | Entrenador receptor de los fondos | UUID v4 |
| `plan_id` | `UUID` | Sí | Plan comercial origen | UUID v4 |
| `periodo` | `string` | Sí | Etiqueta del ciclo (ej. "2026-10") | Formato YYYY-MM |
| `monto_total_usd` | `Decimal` | Sí | Importe pactado en divisa | $> 0.00$ con 2 decimales |
| `monto_abonado_usd`| `Decimal` | Sí | Sumatoria de abonos aprobados | $\ge 0.00$ con 2 decimales |
| `saldo_pendiente_usd`| `Decimal`| Sí | Monto por liquidar | $\text{Total} - \text{Abonado}$ |
| `fecha_emision_utc`| `DateTime`| Sí | Momento de generación | ISO 8601 UTC |
| `fecha_corte_utc` | `DateTime` | Sí | Límite para pagar | ISO 8601 UTC |
| `estado` | `EnumEstadoCuota`| Sí | Máquina de estados de la cuota | Ver máquina de estados |
| `abonos_ids` | `List<UUID>` | Sí | Identificadores de transacciones asociadas | Lista de IDs |

---

## 3. Invariantes de Negocio (Business Invariants)
- **INV-01 (Ecuación Fundamental del Balance):**
  $$\text{saldo\_pendiente\_usd} = \text{monto\_total\_usd} - \text{monto\_abonado\_usd}$$
  El saldo pendiente no puede ser negativo; cualquier excedente genera saldo a favor para el siguiente ciclo.
- **INV-02 (Consistencia de Estados):**
  - Si `saldo_pendiente_usd == 0.00`, el estado DEBE ser `AlDia`.
  - Si `saldo_pendiente_usd > 0.00` y existen pagos en revisión, el estado DEBE ser `PendienteRevision`.
  - Si `saldo_pendiente_usd > 0.00` y $\text{now\_utc()} > \text{fecha\_corte\_utc}$, el estado DEBE ser `Vencida`.
  - Si `saldo_pendiente_usd > 0.00` y $\text{monto\_abonado\_usd} > 0.00$, el estado DEBE ser `AbonadaParcial`.

---

## 4. Relaciones y Límites de Agregado
- **Raíz del Agregado:** `CuotaMembresia`.
- **Referencias externas:** `cliente_id`, `entrenador_id`, `plan_id`.
- **Relación con Transacciones:** Mantiene una lista de referencias a las entidades `TransaccionPago` aprobadas que componen su liquidación.

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `emitirCuota(clienteId, plan, fechaCorte)`: Crea la cuota con saldo total inicial.
- `registrarReportePago()`: Cambia temporalmente el estado a `PendienteRevision` para pausar recordatorios agresivos de cobro.
- `aplicarAbonoAprobado(montoCreditoUsd, transaccionId)`:
  - Incrementa `monto_abonado_usd`.
  - Recalcula `saldo_pendiente_usd`.
  - Asocia `transaccionId` a la lista de abonos.
  - Actualiza el estado a `AbonadaParcial` o `AlDia` (si el saldo llega a 0).
  - Emite `CuotaLiquidadaEvent` si se cubrió el 100%.
- `revertirPago(transaccionId, montoDebitoUsd)`: En caso de error o reversión administrativa.
- `evaluarMora(ahoraUtc)`: Evalúa si expiró la fecha de corte para transicionar a `Vencida`.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `CuotaEmitidaEvent`: Dispara la notificación T - 5 días.
- `AbonoRegistradoEvent`: Informa al coach y al alumno del abono parcial.
- `CuotaLiquidadaEvent`: Restaura o asegura el acceso ininterrumpido a rutinas y servicios.
- `CuotaEntroEnMoraEvent`: Activa las alertas de cobro en T + 2 días.

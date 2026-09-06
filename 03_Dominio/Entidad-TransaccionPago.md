---
entidad: TransaccionPago
modulo: Finanzas
tipo: AggregateRoot
estado_ciclo_vida: activo
fecha_creacion: 2026-09-06
tags:
  - dominio
  - ddd
  - entidad
  - finanzas
  - pagos
---

# Entidad de Dominio: TransaccionPago

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Registro atómico e inmutable de un intento o abono monetario reportado por el cliente y sujeto a verificación por el entrenador.

- **Definición de negocio:** Constancia de transferencia, depósito o entrega en efectivo que acredita fondos hacia una cuota pendiente.
- **Términos del Dominio:**
  - `Tasa Congelada de Transacción`: Valor cambiario fijado en el momento exacto en que el alumno envía el reporte.
  - `Comprobante de Pago`: Evidencia digital (screenshot / recibo bancario).
  - `Conciliación`: Proceso de auditoría donde el coach confirma el ingreso de fondos.
- **Bounded Context:** Contexto de Pasarela Manual y Tesorería.

---

## 2. Atributos Clave (Schema de Dominio)

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Sí | Identificador único inmutable | UUID v4 |
| `cuota_id` | `UUID` | Sí | Cuota asociada a la que abona | UUID v4 |
| `cliente_id` | `UUID` | Sí | Alumno que reporta el pago | UUID v4 |
| `entrenador_id` | `UUID` | Sí | Entrenador destinatario | UUID v4 |
| `registrado_por` | `UUID` | Sí | Quién asentó la transacción (Cliente o Entrenador) | UUID v4 |
| `monto_original` | `Decimal` | Sí | Cifra exacta transferida | $> 0.00$ con 2 decimales |
| `moneda_original` | `EnumMoneda` | Sí | Moneda del pago | `USD` o `VES` |
| `tasa_cambio_fijada`| `Decimal`| Sí | Tasa vigente al reportar (si VES)| $> 0.0000$ con 4 decimales |
| `monto_equivalente_usd`| `Decimal`| Sí | Crédito resultante en divisa | $\text{Monto} / \text{Tasa}$ (o monto si USD) |
| `metodo_pago` | `EnumMetodoPago` | Sí | Canal financiero utilizado | PagoMovil, Transferencia, Efectivo, etc. |
| `referencia_bancaria`| `string` | No | Últimos 4-6 dígitos del recibo | Requerido para transferencias/móvil |
| `comprobante_url` | `string` | No | Enlace a la captura (Opcional en efectivo directo)| Storage Key privada |
| `estado_conciliacion`| `EnumEstadoConciliacion`| Sí | `Pendiente`, `Aprobado`, `Rechazado` | Máquina de estados |
| `motivo_rechazo` | `string` | No | Explicación del coach si se niega| Requerido si `Rechazado` |
| `fecha_reporte_utc`| `DateTime` | Sí | Momento de carga del reporte | ISO 8601 UTC |
| `fecha_conciliacion_utc`| `DateTime`| No | Momento de aprobación/rechazo | ISO 8601 UTC |

---

## 3. Invariantes de Negocio (Business Invariants)
- **INV-01 (Congelamiento Inmutable de Tasa):** La `tasa_cambio_fijada` y el `monto_equivalente_usd` quedan sellados al momento del reporte. Si la tasa global cambia posteriormente mientras el pago está en revisión, el monto acreditado en USD NO sufre modificaciones.
- **INV-02 (Transición Terminal de Estado):** Una transacción en estado `Aprobado` no puede volver a pasar a `Pendiente` ni modificarse; solo puede cancelarse mediante una reversión administrativa explícita.
- **INV-03 (Exigencia de Justificación de Rechazo):** Para transicionar a `Rechazado`, es mandatorio registrar un `motivo_rechazo` descriptivo para el cliente.
- **INV-04 (Cobro Directo por el Entrenador):** Si `registrado_por == entrenador_id`, la transacción transiciona inmediatamente a estado `Aprobado` al crearse, sin requerir comprobante fotográfico ni pasar por la bandeja de pendientes.

---

## 4. Relaciones y Límites de Agregado
- **Raíz del Agregado:** `TransaccionPago`.
- **Relación con Cuota:** Se asocia directamente con la `CuotaMembresia` a través de `cuota_id`.

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `reportarPagoCliente(cuotaId, clienteId, monto, moneda, tasaVigente, metodo, referencia, comprobanteKey)`: Factoría invocada por el alumno. Congela la conversión en USD, sella `registrado_por = clienteId` y coloca el pago en `Pendiente`.
- `registrarCobroDirectoEfectivo(cuotaId, entrenadorId, clienteId, monto, moneda, tasaVigente)`: Factoría invocada por el coach desde el Tablero de Cartera. Sella `registrado_por = entrenadorId`, fija estado `Aprobado` de inmediato y emite `PagoConciliadoAprobadoEvent`.
- `aprobar(entrenadorId)`: Valida permisos, marca estado `Aprobado`, sella `fecha_conciliacion_utc` y emite `PagoConciliadoAprobadoEvent`.
- `rechazar(entrenadorId, motivo)`: Marca estado `Rechazado`, persiste el motivo y emite `PagoRechazadoEvent`.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `PagoReportadoEvent`: Notifica al entrenador de una nueva entrada en su bandeja de conciliación.
- `PagoConciliadoAprobadoEvent`: Dispara la deducción de deuda en la `CuotaMembresia` correspondiente.
- `PagoRechazadoEvent`: Notifica al cliente por correo y push para que subsane el inconveniente con su banco.

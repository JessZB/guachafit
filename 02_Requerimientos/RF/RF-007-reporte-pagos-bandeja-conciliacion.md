---
id: RF-007
modulo: Finanzas
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-10-11
problema_origen: "[[PROB-002-cobranza-bimonetaria-fraccionada]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - finanzas
  - conciliacion
---

# RF-007: Reporte de Pagos por el Cliente y Bandeja de Conciliación para el Entrenador

## 1. Contexto y Justificación
Sustituye la recepción caótica de comprobantes por WhatsApp mediante un flujo digital estandarizado. Proporciona al alumno una interfaz de reporte con captura de datos estructurados y al entrenador una bandeja de entrada donde puede verificar y liquidar pagos con un solo clic.

- **Objetivo:** Capturar datos fidedignos de pago (monto, moneda, referencia bancaria y captura) y agilizar la verificación manual del entrenador.
- **Valor aportado:** Reducción del tiempo de conciliación en más del 80%, historial inmutable de comprobantes y notificaciones automáticas al cliente sobre el estado de su pago.
- **Trazabilidad:** Resuelve el desorden de chats y comprobantes perdidos documentado en [[PROB-002-cobranza-bimonetaria-fraccionada]].

---

## 2. Actores Involucrados
- **Cliente:** Realiza la transferencia/pago y carga los datos y comprobante en su interfaz.
- **Entrenador:** Revisa los pagos entrantes en su bandeja de conciliación y los aprueba o rechaza.

---

## 3. Precondiciones
1. El cliente debe tener una cuota generada en estado `Por Vencer`, `Abonada (Parcial)` o `Vencida / En Mora`.
2. El cliente debe haber realizado previamente la operación bancaria o entrega de efectivo.

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Métodos de Pago Manuales Soportados):**
  - `Pago Móvil (Bs.)`
  - `Transferencia Bancaria Nacional (Bs.)`
  - `Efectivo (USD o Bs.)`
  - `Billeteras Digitales / Internacionales (Zelle, Zinli, Binance Pay, PayPal, etc.)`
- **RN-02 (Campos Obligatorios del Formulario de Reporte):**
  - `Monto Pagado`: Valor numérico positivo.
  - `Moneda`: Selector excluyente (`USD` o `VES / Bs.`).
  - `Método Utilizado`: Uno de los canales de RN-01.
  - `Número de Referencia`: Obligatorio para canales electrónicos (últimos 4 a 6 dígitos alfanuméricos). Opcional para efectivo.
  - `Comprobante`: Imagen/captura de pantalla del recibo bancario (formatos WebP, JPEG o PNG $\le 5$ MB).
- **RN-03 (Bandeja de Conciliación del Entrenador):**
  - Lista de transacciones en estado `Pendiente de Verificación` ordenadas por fecha/hora de reporte (FIFO).
  - Cada tarjeta presenta: Nombre del alumno, monto en moneda original, equivalente calculado en USD, método, referencia bancaria y botón de previsualización modal del comprobante.
- **RN-04 (Acción de Aprobación):** Al presionar *"Aprobar"*, el sistema:
  1. Transiciona la transacción a estado `Aprobado`.
  2. Descuenta el crédito en USD del saldo pendiente de la cuota.
  3. Reevalúa el estado general de la cuota (si el saldo llega a 0, transiciona a `Al Día / Pagada`).
  4. Envía notificación inmediata al cliente (push y correo) con recibo de confirmación.
- **RN-05 (Acción de Rechazo):** Al presionar *"Rechazar"*, el sistema exige al entrenador ingresar un motivo de rechazo (ej. *"Referencia no aparece en cuenta"*, *"Monto insuficiente"*, *"Comprobante ilegible"*). La transacción pasa a `Rechazado` y el cliente es notificado con el motivo para que reenvíe el reporte.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Reporte Exitoso de Pago Móvil por el Alumno
```gherkin
Given que el alumno tiene una cuota con saldo pendiente de $40.00 USD
When completa el formulario con:
  | Monto  | Moneda | Método     | Referencia | Comprobante           |
  | 1200   | VES    | Pago Móvil | 984521     | captura_banco.jpg     |
  And presiona "Enviar Comprobante"
Then el sistema debe guardar la transacción en estado "Pendiente de Verificación"
  And cambiar temporalmente el estado de la cuota a "Pendiente de Revisión"
  And alertar al entrenador: "Nuevo pago recibido de [Alumno] por Bs. 1,200"
```

### Escenario 2: Entrenador Aprueba Pago desde la Bandeja
```gherkin
Given que el entrenador tiene un pago en su bandeja por Bs. 1,200 ($20.00 USD equivalentes)
When revisa el comprobante y presiona "Aprobar Pago"
Then el sistema debe marcar la transacción como "Aprobada"
  And reducir el saldo pendiente de la cuota de $40.00 a $20.00 USD
  And cambiar el estado de la cuota a "Abonada (Parcial)"
  And enviar una notificación al alumno: "Tu pago por Bs. 1,200 ha sido verificado con éxito"
```

### Escenario 3: Entrenador Rechaza Pago por Referencia Inexistente
```gherkin
Given que el entrenador verifica su cuenta bancaria y no encuentra la referencia "984521"
When presiona "Rechazar Pago" e introduce el motivo: "Fondos no recibidos en cuenta"
Then la transacción debe transicionar a estado "Rechazado"
  And el saldo adeudado del alumno no debe modificarse
  And la cuota debe regresar a su estado previo ("Por Vencer" o "Vencida")
  And el alumno debe recibir una notificación de rechazo con el mensaje del entrenador
```

---

## 6. Casos Borde y Excepciones
- **Referencias Bancarias Duplicadas:** Si un alumno intenta enviar una referencia ya existente para el mismo banco y fecha, el sistema debe alertar: *"Esta referencia ya ha sido registrada previamente"* para evitar fraude o doble reporte accidental.
- **Cancelación de Pago Erróneo:** Si el entrenador aprueba un pago por error, debe existir una opción de reversión administrativa auditada que devuelva el saldo a su estado original.

---

## 7. Estado real de implementación

- Flujo completo implementado y probado: reporte del alumno, bandeja FIFO, aprobación y rechazo.
- Sin reversión administrativa de un pago aprobado por error (caso borde del requisito).
- El comprobante es opcional en la implementación, aunque RN-02 lo define obligatorio.
- Entrega de notificaciones simulada: no hay envío push/email real verificado.

### Referencias duplicadas por entrenador (2026-10-09, `ee23aef`)
- El índice único era GLOBAL `(metodo_pago, referencia_bancaria, fecha_operacion)`: mezclaba referencias de entrenadores distintos y, como el cobro en sala guardaba la referencia fija `COBRO_DIRECTO_SALA`, el segundo cobro en efectivo del día fallaba en toda la plataforma.
- Ahora es `uq_transaccion_referencia_entrenador`, **por entrenador y parcial**: solo referencias no nulas, de métodos electrónicos y de pagos no rechazados (un pago rechazado puede reenviarse con la misma referencia). El efectivo no guarda referencia y el centinela se limpió a `NULL` (migración `0018`).
- Un duplicado responde 409 *"Esta referencia ya ha sido registrada previamente para este método y fecha de operación."*, tanto en la comprobación previa como si dos envíos simultáneos chocan con el índice (23505).
- Evidencia: `rf007-indice-referencias.e2e.spec.ts` contra PostgreSQL real (**5/5**), `finanzas-service.spec.ts`.

### Reversión de un pago aprobado por error, API (2026-10-11, `4878d7e`)
- **Decisión del dueño (2026-10-11):** solo el **entrenador dueño** puede revertir un pago **aprobado** (de la bandeja o un cobro en sala), en cualquier momento y con **motivo obligatorio**. La reversión deshace exactamente la aprobación; si el saldo a favor que generó ese pago ya se aplicó a otra cuota, se bloquea. El pago queda **Revertido** con su motivo, sin borrarse.
- **Mecanismo:**
  - `POST /finanzas/transacciones/:id/revertir` con `{ motivo }` (`RevertirPagoSchema`); un id mal formado da 404.
  - `revertirTransaccion` bloquea en el orden de la aprobación (transacción → cuota → perfil). Devuelve a la cuota lo aplicado y retira del saldo a favor el excedente de ese pago.
  - Si el saldo a favor no alcanza, responde 409: "No se puede revertir este pago: el saldo a favor que generó ya se aplicó a otra cuota.". Un pago que no está aprobado da 409: "Solo se puede revertir un pago aprobado.".
  - El estado de la cuota sale de la misma regla que el rechazo (`estadoCuotaTrasRetirarAbono`): otro pago en revisión → pendiente de revisión; saldada → al día; con abono → parcial; si no, vencida o emitida según el corte. En pagos anteriores a la `0019` (abonado por encima del total) el pendiente se recalcula desde el total.
  - Migración `0020`: estado `revertido`, `motivo_reversion` y `fecha_reversion_utc`. Los agregados de recaudado solo suman pagos aprobados, así que un pago revertido deja de contar.
  - **Decisión del dueño (2026-10-11):** un pago revertido **libera su referencia**, igual que uno rechazado (RN-05). Si el entrenador revirtió por error, el alumno reenvía el mismo comprobante y se aprueba de nuevo desde la bandeja. Migración `0021`: el índice único parcial de referencias solo cuenta pagos `pendiente` o `aprobado`. Se nombran en positivo porque un predicado de índice no admite casts y el migrador no deja usar `revertido` en la misma transacción que lo crea.
  - El alumno recibe "Tu entrenador revirtió un pago" con el monto, el motivo y que el monto vuelve a figurar como pendiente. Si la cuota vuelve a tener deuda, sus recordatorios se agendan en el acto.
- Evidencia: `apps/api/test/bdd/rf007-reversion-pago-aprobado.spec.ts` (44 casos) y `rf007-reversion-concurrencia.e2e.spec.ts` (Postgres real: reversión frente a emisión sin saldo negativo ni `40P01`, y referencia liberada y reaprobada). La `0020` y la `0021` se aplicaron en un mismo run sobre una BD vacía. API **1674** aprobados (17 omitidos). Revisado con los 4 enfoques y validado; el BLOCKER del `jobId` del aviso y el de la `0021` (cast no inmutable) quedaron corregidos.

### Pagos con fecha anterior: reglas aprobadas (2026-10-11, pendiente de implementar)
- El cobro en sala tendrá un campo de fecha (hoy por defecto y como máximo). La API rechazará fechas futuras en el cobro en sala y en el reporte del alumno (hoy acepta cualquier fecha).
- En bolívares se usa la tasa vigente al registrar (no hay histórico de tasas por día) y el modal la muestra para que el entrenador la confirme.
- El recaudado del mes (KPI-01) sigue contando por fecha de registro, no de pago.

### Pendiente
- Web de la reversión: confirmación al aprobar o rechazar en Conciliación y botón "Revertir pago" con motivo.
- El comprobante sigue siendo opcional.
- Implementar los pagos con fecha anterior (ver arriba).

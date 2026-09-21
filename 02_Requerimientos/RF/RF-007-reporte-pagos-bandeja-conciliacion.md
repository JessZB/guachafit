---
id: RF-007
modulo: Finanzas
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-09-20
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

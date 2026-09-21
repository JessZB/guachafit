---
id: RF-006
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
  - pagos-bimonetarios
---

# RF-006: Motor Bimonetario (USD / Bs.) y Liquidación de Abonos Fraccionados

## 1. Contexto y Justificación
Resuelve la volatilidad y fricción operativa de operar en economías bimonetarias (como la venezolana). Establece el Dólar Estadounidense (USD) como unidad de cuenta maestra (*anchor currency*) y el Bolívar (VES / Bs.) como moneda de pago corriente con cálculo dinámico a la tasa vigente o convenida.

- **Objetivo:** Calcular con exactitud matemática el equivalente en Bolívares de cualquier saldo pendiente y liquidar abonos parciales deduciendo su contravalor en USD del libro mayor.
- **Valor aportado:** Transparencia cambiaria instantánea, protección contra la devaluación y eliminación de disputas de conversión.
- **Trazabilidad:** Resuelve los dolores de cálculo cambiario y liquidación fragmentada de [[PROB-002-cobranza-bimonetaria-fraccionada]].

---

## 2. Actores Involucrados
- **Entrenador:** Actualiza la tasa global de referencia en su panel de control o consulta reportes consolidados.
- **Cliente:** Consulta el monto de su cuota o saldo remanente tanto en USD como en Bs. calculados al día.

---

## 3. Precondiciones
1. El entrenador debe tener una tasa de cambio global configurada y con fecha/hora de última actualización.
2. Cada cuota generada debe tener su monto principal fijado en USD.

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Deuda Maestra en USD):** Toda membresía, cuota o saldo adeudado se expresa y almacena fundamentalmente en USD (`monto_total_usd`, `monto_abonado_usd`, `saldo_pendiente_usd`).
- **RN-02 (Tasa de Cambio Aplicable):** La tasa utilizada para proyectar la deuda en Bolívares se determina según:
  $$\text{Tasa Aplicable} = \begin{cases} \text{Tasa Override Acordada con el Cliente}, & \text{si existe override activo} \\ \text{Tasa Global Vigente del Entrenador}, & \text{en caso contrario} \end{cases}$$
- **RN-03 (Cálculo Dinámico de la Cuota en Bs.):**
  $$\text{Saldo en Bs.} = \text{Saldo Pendiente en USD} \times \text{Tasa Aplicable}$$
- **RN-04 (Liquidación y Deducción de Abonos en Bs.):**
  - Cuando el cliente abona un monto en Bolívares ($M_{\text{Bs}}$), el sistema congela la tasa de cambio vigente en el timestamp del reporte ($T_{\text{reporte}}$).
  - El valor deducible en USD se calcula como:
    $$\Delta_{\text{USD}} = \frac{M_{\text{Bs}}}{T_{\text{reporte}}}$$
  - Al aprobarse la transacción, el nuevo saldo pendiente es:
    $$\text{Saldo Pendiente}_{\text{nuevo}} = \text{Saldo Pendiente}_{\text{anterior}} - \Delta_{\text{USD}}$$
- **RN-05 (Pagos Adelantados y Saldos a Favor):** Si un abono excede el saldo pendiente de la cuota actual, el remanente se registra como saldo a favor en USD y se acredita automáticamente a la cuota del siguiente ciclo de facturación.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Consulta del Saldo en Bs. a Tasa Global
```gherkin
Given que el cliente "Pedro Perez" tiene una cuota mensual de $50.00 USD
  And la tasa global vigente del entrenador es de 60.00 Bs/USD
  And Pedro no tiene tasa preferencial asignada
When Pedro abre la sección de pagos en la app
Then el sistema debe mostrar: "Total a pagar: $50.00 USD (o Bs. 3,000.00)"
  And indicar la fecha y hora de la tasa aplicada
```

### Escenario 2: Abono Fraccionado en Bolívares con Deducción Exacta en USD
```gherkin
Given que el cliente debe una cuota de $50.00 USD
  And realiza un Pago Móvil por Bs. 1,500.00 cuando la tasa es de 60.00 Bs/USD
When el entrenador aprueba la transacción de Bs. 1,500.00
Then el sistema debe calcular un crédito de $25.00 USD ($1,500 / 60)
  And actualizar el saldo pendiente de la cuota a $25.00 USD
  And cambiar el estado de la cuota a "Abonada (Parcial)"
  And reflejar que el nuevo saldo en Bs. es de Bs. 1,500.00 (a la tasa actual)
```

### Escenario 3: Cambio de Tasa Global Protege el Valor Real en USD
```gherkin
Given que el cliente adeuda un saldo restante de $25.00 USD
When el entrenador actualiza la tasa global de 60.00 a 70.00 Bs/USD
Then el saldo pendiente del cliente en USD debe permanecer inalterado en $25.00 USD
  And el saldo proyectado en Bolívares debe recalcularse automáticamente a Bs. 1,750.00 ($25 * 70)
```

---

## 6. Casos Borde y Excepciones
- **Abonos en Céntimos / Redondeo:** Todas las conversiones intermedias deben redondearse al céntimo más cercano (2 decimales en USD y Bs.) utilizando la regla bancaria *Round Half to Even* para evitar discrepancias por acumulación de fracciones.
- **Tasa Cero o Negativa:** La interfaz y la API deben rechazar cualquier intento de fijar una tasa $\le 0$ con un error `422 Unprocessable Entity`.

---

## 7. Estado real de implementación

- Motor bimonetario (USD maestro / Bs. dinámico) implementado y funcional en los flujos principales.
- Resuelto (2026-09-21): eliminada la tasa default `65.0000` fabricada. Sin tasa configurada la API devuelve `null` (fuente `sin_configurar`) y errores de negocio claros; la UI muestra "Sin tasa configurada" en lugar de proyectar un valor ficticio.
- RN-05 ausente: el remanente de un abono en exceso no se registra como saldo a favor para el siguiente ciclo.
- Conversión con punto flotante: sin garantía de precisión decimal estricta en todos los caminos.
- Idempotencia débil: con clave nueva, un pago duplicado responde 409 en lugar de reutilizar el registro; el índice único es cross-tenant.

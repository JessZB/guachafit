---
id: PROB-002
fecha: 2026-09-06
modulo: Finanzas y Membresias
impacto: alto
estado: en_analisis
tags:
  - problema
  - sdd
  - finanzas
  - pagos-bimonetarios
  - cobranza
  - crm
  - mvp
requerimientos_asociados:
  - "[[RF-005-catalogo-planes-override-cliente]]"
  - "[[RF-006-motor-bimonetario-liquidacion-abonos]]"
  - "[[RF-007-reporte-pagos-bandeja-conciliacion]]"
  - "[[RF-008-maquina-estados-cuota-recordatorios]]"
  - "[[RF-009-tablero-control-cartera-morosidad]]"
  - "[[RNF-002-consistencia-financiera-idempotencia-pagos]]"
  - "[[ADR-003-deuda-maestra-usd-liquidacion-multitasa]]"
---

# PROB-002: Gestión de Mensualidades, Pagos Bimonetarios y Control de Cartera

## 1. Descripción del Dolor (Problem Statement)
> El entrenador invierte tiempo excesivo verificando transferencias manuales, calculando conversiones de divisas (USD a Bs.), persiguiendo a clientes morosos y llevando el control de abonos parciales o fechas de corte en libretas o chats de WhatsApp sin un panel centralizado de cobranza y control de cartera.

- **Actor afectado:** Entrenador (fricción administrativa, estrés por cobranza, fuga de ingresos, ceguera sobre morosidad) y Cliente (confusión sobre su saldo exacto y tasa aplicable).
- **Frecuencia del problema:** Diaria (reporte continuo de comprobantes) y Crítica en días de corte de quincena y fin de mes.
- **Impacto directo:**
  - Pérdida de hasta un 15-20% de tiempo semanal del coach en labores de tesorería manual en lugar de entrenamiento.
  - Ceguera sobre el flujo de caja: desconocimiento en tiempo real de cuánto dinero se ha recaudado vs. cuánto está en mora.
  - Riesgo de pérdidas financieras por discrepancias cambiarias en entornos bimonetarios con alta inflación.
  - Incomodidad interpersonal al tener que cobrar manualmente a los clientes mediante mensajes individuales.
  - Pérdida de trazabilidad en abonos parciales ("te pago la mitad hoy y el resto el 15").

---

## 2. Contexto Operativo
- **Flujo actual:**
  1. El entrenador tiene precios acordados de palabra o en chats individuales; algunos pagan tarifa estándar y otros tienen precios especiales o tasas preferenciales.
  2. Al llegar la fecha de corte, el entrenador carece de un tablero consolidado; debe revisar manualmente chat por chat o en cuadernos quién debe y calcular cuántos Bolívares son a la tasa del día.
  3. Los clientes pagan por múltiples rieles: Pago Móvil, transferencia bancaria en Bs, efectivo en dólares, Zelle, Zinli o Binance.
  4. Los clientes envían capturas de pantalla de los comprobantes bancarios al chat personal del coach.
  5. El coach debe entrar a su aplicación bancaria, verificar que la referencia coincida con el saldo en cuenta, calcular cuántos dólares representa el abono si fue en Bs, y restar mentalmente o en un cuaderno el saldo pendiente sin una vista global de cartera.
- **Canales/Herramientas involucradas:** WhatsApp, libretas de papel, banca en línea de múltiples bancos nacionales, wallets digitales (Zelle/Binance), notas de celular.

---

## 3. Causa Raíz Preliminar (5 Porqués)
1. **¿Por qué el entrenador pierde horas conciliando pagos?** Porque tiene que cotejar comprobantes enviados por WhatsApp contra sus estados de cuenta bancarios de forma manual.
2. **¿Por qué hay confusión con los montos en bolívares?** Porque los precios base son en USD pero los pagos suelen realizarse en Bs. a una tasa cambiaria fluctuante (BCV o paralela).
3. **¿Por qué se pierde la cuenta de los abonos parciales y morosos?** Porque no existe un panel centralizado de cobranza (CRM de cartera) que clasifique automáticamente a los clientes por su estado de pago.
4. **¿Por qué la cobranza es incómoda e ineficiente?** Porque el entrenador actúa como cobrador manual sin recordatorios automatizados imparciales emitidos por un sistema.
5. **Causa Raíz Identificada:** Inexistencia de un motor financiero bimonetario integrado a un tablero de control de cartera y morosidad con soporte para overrides, liquidación de abonos a tasa fijada y conciliación ágil.

---

## 4. Vínculos a Requerimientos
- **Requerimientos Funcionales (RF):**
  - [[RF-005-catalogo-planes-override-cliente]]: Catálogo base de membresías con capacidad de sobrescritura de precio, beneficios y tasa por cliente.
  - [[RF-006-motor-bimonetario-liquidacion-abonos]]: Deuda maestra en USD, cálculo dinámico en Bs. y liquidación de abonos a tasa fijada/vigente.
  - [[RF-007-reporte-pagos-bandeja-conciliacion]]: Formulario para reporte de comprobantes del alumno y bandeja de aprobación/rechazo del coach.
  - [[RF-008-maquina-estados-cuota-recordatorios]]: Estados de cuota (`Al Día`, `Abonada`, `Por Vencer`, `Pendiente`, `Mora`) y notificaciones push/email en T-5, T-1, T y T+2.
  - [[RF-009-tablero-control-cartera-morosidad]]: Panel centralizado de cobranza con KPIs financieros, segmentación de cartera y acciones rápidas.
- **Requerimientos No Funcionales (RNF):**
  - [[RNF-002-consistencia-financiera-idempotencia-pagos]]: Precisión decimal exacta, transaccionalidad ACID y prevención de duplicados en referencias bancarias.
- **Decisiones Arquitecturales (ADR):**
  - [[ADR-003-deuda-maestra-usd-liquidacion-multitasa]]: Patrón de deuda maestra en divisa dura (USD) con congelamiento histórico de tasa cambiaria por transacción.

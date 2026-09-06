---
id: ADR-003
titulo: "ADR-003: Arquitectura de Deuda Maestra en USD con Congelamiento de Tasa por Abono en Entornos Bimonetarios"
fecha: 2026-09-06
estado: aceptado
decisores:
  - "Arquitecto de Software"
  - "Equipo de Ingeniería"
tags:
  - decision
  - adr
  - arquitectura
  - finanzas
  - bimonetario
---

# ADR-003: Arquitectura de Deuda Maestra en USD con Congelamiento de Tasa por Abono en Entornos Bimonetarios

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
La economía donde opera **GUACHAFIT** presenta un régimen cambiario bimonetario no oficial caracterizado por:
1. **Precios de Referencia en Moneda Dura:** La estructura de costos y planes del entrenador se valora en Dólares Estadounidenses (USD).
2. **Medios de Pago Primarios en Moneda Local:** La mayoría de los clientes liquidan sus obligaciones en Bolívares (VES) mediante Pago Móvil o transferencia bancaria interbancaria.
3. **Brechas y Dispersión Cambiaria:** Existen fuentes de cambio divergentes (tasa oficial BCV vs. tasa paralela de mercado) y acuerdos particulares donde ciertos clientes pagan a una tasa pactada fija.
4. **Pagos Fraccionados en Diferentes Fechas:** Un cliente puede pagar una parte el día 01 a una tasa cambiaria y el remanente el día 15 a una tasa diferente debido a la devaluación.

### Opciones Evaluadas
- **Opción A (Deuda Anclada en Bolívares):** Fijar la cuota mensual en Bolívares al inicio del mes.
  - *Descartada:* Si el cliente tarda 15 días en pagar, la inflación deteriora el ingreso real del entrenador en términos de poder adquisitivo.
- **Opción B (Exclusividad en USD):** Permitir únicamente pagos en efectivo en dólares o transferencias internacionales (Zelle).
  - *Descartada:* Provocaría la pérdida de más del 50% de la base de clientes que no disponen de cuentas extranjeras ni dólares físicos fraccionados.
- **Opción C (Deuda Maestra en USD + Congelamiento de Tasa por Transacción):**
  - La unidad de cuenta y libro mayor (*ledger*) opera 100% en USD.
  - Los abonos en Bolívares se convierten a USD congelando la tasa pactada o vigente al segundo exacto del reporte del pago (`rate locking at transaction snapshot`).

---

## 3. Decisión
Adoptamos la **Opción C**.

```
[Membresía / Cuota]
  │ Deuda Total fijada en USD (ej. $50.00 USD)
  │
  ├── Abono 1: Bs. 1,200 @ Tasa: 60 Bs/USD ──> Deduce: $20.00 USD
  │   (Saldo restante: $30.00 USD)
  │
  │ [Pasa 1 semana: Tasa sube a 65 Bs/USD]
  │
  └── Abono 2: Bs. 1,950 @ Tasa: 65 Bs/USD ──> Deduce: $30.00 USD
      (Saldo restante: $0.00 USD ──> CUOTA PAGADA)
```

### Reglas de Diseño Técnico
1. **Inmutabilidad del Snapshot Cambiario:** Una vez que una `TransaccionPago` en Bs. es creada, almacena en sus metadatos la tasa exacta del instante. Si la tasa global cambia mientras el coach verifica el banco, el monto resultante en USD para esa transacción permanece inalterado.
2. **Prioridad de Tasa (Override > Global):** Si un cliente tiene una tasa fijada en su perfil, el motor ignora la tasa general del entrenador y calcula las conversiones con el valor personalizado.
3. **Monto en Bs. Proyectado en Tiempo Real:** En la interfaz del cliente, el saldo pendiente en Bolívares es un campo calculado al vuelo en función de la tasa aplicable en el momento de la consulta.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **Blindaje del Negocio:** El entrenador preserva el valor real de su tarifa independientemente de la devaluación local.
- **Justicia y Transparencia para el Alumno:** Cada abono en bolívares se liquida al valor de mercado del día en que se realizó el pago, sin penalizaciones arbitrarias.
- **Trazabilidad Contable:** Facilita la generación de reportes tributarios o personales al tener cada abono desglosado con su contravalor cambiario histórico.

### Consecuencias Negativas (Trade-offs)
- **Explicabilidad al Usuario:** La interfaz debe educar claramente al usuario de que su saldo en Bolívares puede variar de un día a otro si la tasa cambia, mientras que su saldo en USD se mantiene constante.

---

## 5. Trazabilidad y Referencias
- Resuelve la problemática: [[PROB-002-cobranza-bimonetaria-fraccionada]]
- Requerimientos asociados:
  - [[RF-005-catalogo-planes-override-cliente]]
  - [[RF-006-motor-bimonetario-liquidacion-abonos]]
  - [[RF-007-reporte-pagos-bandeja-conciliacion]]
  - [[RF-008-maquina-estados-cuota-recordatorios]]
  - [[RNF-002-consistencia-financiera-idempotencia-pagos]]
- Entidades vinculadas: [[Entidad-PlanMembresia]], [[Entidad-CuotaMembresia]], [[Entidad-TransaccionPago]]

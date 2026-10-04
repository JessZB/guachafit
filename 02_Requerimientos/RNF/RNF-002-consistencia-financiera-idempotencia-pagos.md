---
id: RNF-002
modulo: Finanzas
categoria: consistencia-financiera # consistencia-financiera | seguridad | rendimiento
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-10-04
requisito_origen: "[[RF-006-motor-bimonetario-liquidacion-abonos]]"
metrica_objetivo: "100% precisión decimal (cero floating-point error) / Idempotencia estricta"
fecha_creacion: 2026-09-06
tags:
  - requerimiento
  - rnf
  - sdd
  - finanzas
  - consistencia
---

# RNF-002: Consistencia Financiera, Idempotencia y Transaccionalidad de Pagos

## 1. Definición y Alcance
El módulo de finanzas maneja saldos adeudados, deducciones de abonos y conversiones bimonetarias. Este requerimiento define los estándares no negociables de integridad contable, aislamiento transaccional (ACID), prevención de doble acreditación y precisión matemática.

- **Atributos de calidad:** Integridad Contable, Idempotencia, Seguridad Financiera y Auditabilidad.
- **Componentes afectados:** Ledger Service, Motor de Pagos, Base de Datos Transaccional (RDBMS).

---

## 2. Métricas Cuantitativas y SLOs / SLAs

| Métrica | Valor Mínimo Aceptable | Valor Deseado (SLO) | Condición de Medición |
| :--- | :--- | :--- | :--- |
| **Precisión Decimal en Cálculos** | 100% libre de error binario | Tipo `Decimal(12, 2)` / Céntimos enteros | Operaciones en USD y Bs. |
| **Tiempo de Conciliación de Pago (p95)**| < 350 ms | < 150 ms | Mutación atómica en BD |
| **Detección de Referencia Duplicada** | < 100 ms | < 30 ms | Validación en índice único |
| **Disponibilidad del Servicio Financiero**| 99.95% | 99.99% | Mensual |

---

## 3. Integridad Contable y Precisión Numérica
- **Prohibición Estricta de Números de Punto Flotante (IEEE 754):** Queda terminantemente prohibido el uso de tipos `float` o `double` para almacenar o calcular dinero en backend o base de datos.
- **Almacenamiento Estándar:** Todos los montos se almacenan como enteros en céntimos (ej. `$50.00` = `5000` cents) o mediante columnas `DECIMAL(14, 2)`. Las tasas de cambio se almacenan con al menos 4 decimales (`DECIMAL(12, 4)`).
- **Invariante de Balance:** Para cualquier cuota:
  $$\text{saldo\_pendiente} \equiv \text{monto\_total} - \sum \text{abonos\_aprobados}$$
  Cualquier discrepancia detectada por el reconciliador debe lanzar una excepción crítica y bloquear la cuota para auditoría.

---

## 4. Idempotencia y Prevención de Doble Gasto
- **Clave de Idempotencia en Pagos:** La inserción de un reporte de pago debe estar protegida por un índice único compuesto en base de datos:
  $$\text{UNIQUE}(\text{metodo\_pago}, \text{referencia\_bancaria}, \text{fecha\_operacion})$$
- Si un usuario pulsa repetidamente el botón *"Enviar Comprobante"* debido a lag de red, el sistema debe retornar el registro existente sin generar múltiples transacciones pendientes.

---

## 5. Transaccionalidad ACID y Concurrencia
- La operación de *"Aprobar Pago"* que involucra:
  1. Cambiar estado de `TransaccionPago` a `Aprobado`.
  2. Incrementar `monto_abonado_usd` de la `CuotaMembresia`.
  3. Disminuir `saldo_pendiente_usd`.
  4. Actualizar estado de la cuota (`Abonada` o `Pagada`).
  DEBE ejecutarse dentro de una **transacción de base de datos atómica con nivel de aislamiento READ COMMITTED o SERIALIZABLE** utilizando bloqueo pesimista o control de concurrencia optimista (`version` column).

---

## 6. Seguridad y Retención de Comprobantes
- Los comprobantes bancarios (imágenes) deben almacenarse en bucket privado con cifrado en reposo (SSE-S3 / AES-256).
- Retención mínima de comprobantes: 5 años para cumplimiento tributario y resolución de disputas.

---

## 7. Estado real de implementación

- Base decimal y transaccionalidad ACID implementadas en los caminos principales.
- Conversión bimonetaria con punto flotante: sin garantía de precisión decimal estricta.
- Idempotencia no persistente: no se garantiza la deduplicación de reportes de pago.
- Sin detección de sobre-abono ni reconciliador de la invariante de saldo.
- Implementado (2026-10-04, LOTE API-3 `bc53864`): la idempotencia en memoria de `finanzas.service` (antes un `Map` sin límite) usa el `RegistroIdempotencia` compartido con entrenamiento y plantillas: TTL de 24 h, tope de 10 000 entradas y **dedupe de envíos simultáneos** con la misma clave (`apps/api/src/common/idempotencia/registro-idempotencia.ts`). **Sigue pendiente** la idempotencia persistente: el registro vive en el proceso (un reinicio o varias réplicas no lo comparten). Evidencia: API **986** tras API-3.

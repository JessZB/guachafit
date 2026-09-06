---
id: ADR-006
titulo: "ADR-006: Selección de PostgreSQL 16+ y Drizzle ORM para Persistencia Relacional con Precisión Financiera Exacta"
fecha: 2026-09-06
estado: aceptado
decisores:
  - "Tech Lead & Principal Software Architect"
  - "Equipo de Ingeniería"
tags:
  - decision
  - adr
  - arquitectura
  - base-de-datos
  - postgresql
  - drizzle-orm
  - finanzas
---

# ADR-006: Selección de PostgreSQL 16+ y Drizzle ORM para Persistencia Relacional con Precisión Financiera Exacta

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
La persistencia de datos en **GUACHAFIT** debe cumplir con dos mandatos no negociables:
1. **Precisión Matemática Absoluta en Dinero (`RNF-002`):** Está terminantemente prohibido el uso de números de coma flotante (`float`, `double`) según el estándar IEEE 754. Los cálculos deben ejecutarse con precisión arbitraria decimal (`NUMERIC(14,2)` para dinero y `NUMERIC(12,4)` para tasas).
2. **Control Fino de Concurrencia y Transacciones ACID:** Al conciliar abonos o aplicar pagos directos en efectivo (`RF-007`), es indispensable bloquear la fila de la cuota mediante `SELECT ... FOR UPDATE` dentro de una transacción interactiva serializada.
3. **Manejo Estricto de Tiempos Universales (`ADR-002`):** La base de datos debe almacenar todo momento cronológico en `TIMESTAMPTZ` (UTC estricto).

### Opciones de ORM / Capa de Acceso a Datos Consideradas
1. **Opción A (Prisma ORM):** Muy popular en el ecosistema Node.js, pero opera mediante un motor binario en Rust (*query-engine*) intermedio. Presenta limitaciones en transacciones interactivas de alta concurrencia (timeouts estrictos de 5 segundos), mayor consumo de memoria en contenedores y menor control sobre consultas SQL crudas con locks pesimistas específicos.
2. **Opción B (TypeORM):** ORM tradicional basado en decoradores de clase, pero con un historial conocido de problemas no resueltos en transacciones concurrentes, fugas de conexiones y evolución lenta.
3. **Opción C (Drizzle ORM con driver `pg` / `postgres.js`):** ORM moderno "SQL-like" en TypeScript sin sobrecarga en tiempo de ejecución. Ofrece control granular sobre sentencias SQL nativas, soporte directo para transacciones interactivas ACID, bloqueo pesimista mediante `.for('update')`, y migraciones puras en SQL gestionadas por `drizzle-kit`.

---

## 3. Decisión
Elegimos **PostgreSQL 16+** como motor de base de datos relacional y **Drizzle ORM** como capa de acceso a datos y migraciones.

```typescript
// Ejemplo de transacción financiera atómica con bloqueo pesimista en Drizzle ORM
await db.transaction(async (tx) => {
  // 1. Bloqueo pesimista de la cuota para evitar doble acreditación concurrente
  const [cuota] = await tx
    .select()
    .from(cuotasMembresia)
    .where(eq(cuotasMembresia.id, cuotaId))
    .for('update');

  if (!cuota) throw new NotFoundException('Cuota no encontrada');

  // 2. Aprobación inmutable de la transacción de pago
  await tx
    .update(transaccionesPago)
    .set({
      estadoConciliacion: 'aprobado',
      fechaConciliacionUtc: new Date(),
    })
    .where(eq(transaccionesPago.id, transaccionId));

  // 3. Recálculo exacto del saldo en USD (RNF-002 / ADR-003)
  const nuevoAbonado = new Decimal(cuota.montoAbonadoUsd).plus(montoAbonoUsd);
  const nuevoSaldo = Decimal.max(0, new Decimal(cuota.montoTotalUsd).minus(nuevoAbonado));
  const nuevoEstado = nuevoSaldo.isZero() ? 'al_dia' : 'abonada_parcial';

  // 4. Actualización atómica de la cuota
  await tx
    .update(cuotasMembresia)
    .set({
      montoAbonadoUsd: nuevoAbonado.toFixed(2),
      saldoPendienteUsd: nuevoSaldo.toFixed(2),
      estado: nuevoEstado,
      updatedAtUtc: new Date(),
    })
    .where(eq(cuotasMembresia.id, cuotaId));
});
```

### Reglas de Diseño de Base de Datos
1. **Tipos Numéricos Financieros:**
   - Montos en divisa y moneda local: `NUMERIC(14,2)` en DDL, manipulados con librerías de precisión arbitraria (`decimal.js` o `bignumber.js`) en el backend antes de persistir.
   - Tasas de cambio: `NUMERIC(12,4)` (ej. `65.4321` Bs/USD).
2. **Manejo Temporal:** Todas las columnas de fecha y hora utilizan `TIMESTAMP WITH TIME ZONE` con valor por defecto `CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`.
3. **Idempotencia Estricta:** Las transacciones bancarias implementan un índice único compuesto:
   ```sql
   CREATE UNIQUE INDEX uq_transaccion_idempotencia 
   ON transacciones_pago (metodo_pago, referencia_bancaria, fecha_operacion);
   ```
4. **Validaciones a Nivel de Motor (Check Constraints):** La base de datos rechaza inserciones de saldos negativos o métricas antropométricas fuera de rango fisiológico.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **Cero Riesgo de Pérdida Financiera:** PostgreSQL y Drizzle garantizan transaccionalidad ACID pura y cero errores de redondeo IEEE 754.
- **Rendimiento Excepcional:** Drizzle no tiene sobrecarga de serialización ni binarios pesados en runtime. Las consultas compilan a sentencias SQL limpias y predecibles.
- **Transparencia en Migraciones:** Las migraciones generadas por `drizzle-kit` son scripts SQL estándar que pueden auditarse y ejecutarse en cualquier entorno de CI/CD.

### Consecuencias Negativas (Trade-offs)
- **Mayor Rigor en TypeScript:** A diferencia de Prisma, donde las relaciones complejas se resuelven automáticamente con `include`, Drizzle requiere que el desarrollador declare explícitamente los `leftJoin` o utilice su API relacional tipada, exigiendo mayor conocimiento de SQL en el equipo.

---

## 5. Trazabilidad y Referencias
- **Problemas que resuelve:** [[PROB-002-cobranza-bimonetaria-fraccionada]]
- **Requerimientos asociados:**
  - [[RNF-002-consistencia-financiera-idempotencia-pagos]]
  - [[RF-006-motor-bimonetario-liquidacion-abonos]]
  - [[RF-007-reporte-pagos-bandeja-conciliacion]]
- **Decisiones previas vinculadas:**
  - [[ADR-002-gestion-fechas-utc-zonas-horarias]]
  - [[ADR-003-deuda-maestra-usd-liquidacion-multitasa]]
- **Documento de Esquema:** [[02_Esquema_Base_de_Datos_PostgreSQL]]

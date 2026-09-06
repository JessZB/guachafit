---
id: ADR-008
titulo: "ADR-008: Motor de Tareas Asíncronas y Planificador de Recordatorios de Cobro con Redis y BullMQ"
fecha: 2026-09-06
estado: aceptado
decisores:
  - "Tech Lead & Principal Software Architect"
  - "Equipo de Ingeniería"
tags:
  - decision
  - adr
  - arquitectura
  - colas
  - background-jobs
  - redis
  - bullmq
  - finanzas
---

# ADR-008: Motor de Tareas Asíncronas y Planificador de Recordatorios de Cobro con Redis y BullMQ

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
La automatización de procesos temporales es el núcleo que erradica la morosidad y el desgaste operativo del entrenador:
1. **Flujo de Recordatorios de Cobranza Escalonada (`RF-008`, `RF-009`):** Al emitirse una cuota, el sistema debe garantizar el despacho de notificaciones en hitos matemáticos exactos respecto a la `fecha_corte_utc`:
   - $T - 5$ días: Aviso preventivo de emisión de cuota y saldo a pagar.
   - $T - 1$ día: Alerta de vencimiento inminente en 24 horas.
   - $T$ (Día de corte): Notificación formal de vencimiento.
   - $T + 2$ días: Alerta de mora y recargo operativo administrativo.
2. **Alertas Diarias de Check-in Nutricional y Antropométrico:** Notificaciones push en la mañana (06:00 AM) para check-in en ayunas según el huso horario IANA del alumno (`ADR-002`).
3. **Desacoplamiento y Resiliencia:** El envío de notificaciones externas (WhatsApp Business API, Firebase Cloud Messaging, SendGrid/Resend) está sujeto a latencias variables de red y caídas temporales de proveedores externos. Estos despachos **no deben bloquear las peticiones HTTP** de la API.
4. **Idempotencia y Cancelación Dinámica:** Si un alumno abona o liquida la totalidad de su cuota anticipadamente, los recordatorios futuros programados deben ser cancelados de inmediato para evitar cobrar a clientes que ya están al día.

### Opciones Consideradas
1. **Opción A (Cron Job Monolítico con Polling en Base de Datos):** Un cron cada hora que hace `SELECT * FROM cuotas_membresia WHERE fecha_corte ...`. *Descartada:* Genera contención innecesaria de lecturas en PostgreSQL, riesgo de condiciones de carrera y retrasos de reloj.
2. **Opción B (AWS SQS + EventBridge Scheduler):** Altamente escalable pero añade complejidad de aprovisionamiento en AWS, costos adicionales y soporte limitado para delayed jobs largos directos en SQS.
3. **Opción C (Redis 7+ con BullMQ en NestJS):** Estándar de la industria en el ecosistema Node.js/TypeScript. Soporta de forma nativa trabajos retrasados (*delayed jobs* con timestamp futuro arbitrario), deduplicación por `jobId`, reintentos con backoff exponencial y cancelación de tareas por ID.

---

## 3. Decisión
Elegimos la **Opción C: Redis 7+ con BullMQ integrado mediante el módulo oficial `@nestjs/bullmq`**:

```
[Módulo Finanzas: Evento CuotaEmitidaEvent]
                    │
                    ▼
         [BillingScheduleService]
                    │
   Calcula timestamps UTC exactos (T-5, T-1, T, T+2)
                    │
                    ├── Agenda Job (T-5): jobId = "cuota_{id}_T-5", delay = deltaMs
                    ├── Agenda Job (T-1): jobId = "cuota_{id}_T-1", delay = deltaMs
                    ├── Agenda Job (T):   jobId = "cuota_{id}_T-0", delay = deltaMs
                    └── Agenda Job (T+2): jobId = "cuota_{id}_T+2", delay = deltaMs
                    │
                    ▼
           [Redis BullMQ Queue] ──── (Espera pasiva en memoria)
                    │
       (Al llegar el timestamp UTC programado)
                    ▼
          [NotificationProcessor Worker]
                    │
        Verifica en PostgreSQL: ¿Cuota sigue impaga?
           ├── SI ──> Despacha Push / WhatsApp / Email
           └── NO ──> Job finalizado sin enviar notificación
```

### Reglas de Diseño e Implementación
1. **Estructura de Identificadores de Job Determinísticos:**
   Todo trabajo diferido encolado en BullMQ tiene un `jobId` predecible:
   ```
   cuota:{cuotaId}:hito:{T_MINUS_5 | T_MINUS_1 | T_ZERO | T_PLUS_2}
   ```
   Esto garantiza que, si por alguna razón se re-emite el evento o se reintenta la operación, BullMQ descarte automáticamente el job duplicado.
2. **Cancelación ante Pago Aprobado (`CuotaLiquidadaEvent`):**
   Cuando un pago es conciliado y el saldo pendiente llega a cero (`saldo_pendiente_usd == 0.00`), el manejador del evento ejecuta:
   ```typescript
   await billingQueue.remove(`cuota:${cuotaId}:hito:T_MINUS_1`);
   await billingQueue.remove(`cuota:${cuotaId}:hito:T_ZERO`);
   await billingQueue.remove(`cuota:${cuotaId}:hito:T_PLUS_2`);
   ```
3. **Reintentos y Resiliencia:** Cada worker de notificación está configurado con 3 reintentos y política de retroceso exponencial (`backoff: { type: 'exponential', delay: 5000 }`) para tolerar caídas momentáneas de proveedores de mensajería.
4. **Dashboard de Observabilidad:** Se monta **Bull-Board** en una ruta administrativa protegida (`/admin/queues`) para que el equipo de soporte técnico monitoree trabajos activos, fallidos y en espera.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **Cero Fatiga Operativa:** Cobranza 100% automatizada y puntual sin intervención humana.
- **Protección de la Base de Datos:** Se eliminan las consultas pesadas de sondeo periódico (`polling`); los eventos se despachan quirúrgicamente en el instante exacto.
- **Cero Mensajes Duplicados a Clientes:** La idempotencia por `jobId` asegura que ningún usuario reciba un recordatorio por partida doble.

### Consecuencias Negativas (Trade-offs)
- **Dependencia de Infraestructura In-Memory:** Requiere mantener una instancia de Redis 7+ activa y monitoreada. Si Redis se cae sin persistencia AOF habilitada, los trabajos encolados podrían perderse. *Mitigación:* Se configura persistencia AOF (*Append-Only File*) y snapshots periódicos RDB en la instancia de Redis.

---

## 5. Trazabilidad y Referencias
- **Problemas que resuelve:** [[PROB-002-cobranza-bimonetaria-fraccionada]]
- **Requerimientos asociados:**
  - [[RF-008-maquina-estados-cuota-recordatorios]]
  - [[RF-009-tablero-control-cartera-morosidad]]
  - [[RNF-002-consistencia-financiera-idempotencia-pagos]]
- **Decisiones previas vinculadas:**
  - [[ADR-002-gestion-fechas-utc-zonas-horarias]]
  - [[ADR-003-deuda-maestra-usd-liquidacion-multitasa]]
- **Documento de Arquitectura:** [[01_Evaluacion_Stack_Tecnologico]]

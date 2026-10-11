---
id: ADR-020
titulo: "ADR-020: Suscripción del Alumno y Emisión Automática de Cuotas por Meses de Calendario"
fecha: 2026-10-09
estado: aceptado
decisores:
  - "Dueño del producto"
  - "Tech Lead"
tags:
  - decision
  - adr
  - arquitectura
  - backend
  - finanzas
  - cobranza
---

# ADR-020: Suscripción del Alumno y Emisión Automática de Cuotas por Meses de Calendario

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
[[RF-005-catalogo-planes-override-cliente]] define planes con un ciclo de facturación y [[RF-008-maquina-estados-cuota-recordatorios]] gobierna la cuota desde su emisión, pero nadie emitía las cuotas: dependían de que el entrenador las creara a mano (`POST /finanzas/cuotas/emitir`). Además:

- El "plan del alumno" se deducía del override o de la última cuota; no había un dato que dijera qué plan tiene y cuándo vence el próximo ciclo.
- El cobro en sala ([[RF-009-tablero-control-cartera-morosidad]] RN-01) inventaba una cuota del mes con el plan del override, sin relación con el ciclo real.
- RF-008 dejaba pendiente la "renovación automática de periodo": una cuota vencida nunca daba paso a la siguiente.

---

## 3. Decisión
El plan asignado vive en el **perfil del alumno** como una suscripción, y las cuotas se **emiten solas** a partir de ella. Decisiones del dueño (2026-10-09):

- emisión **automática** (no hay emisión manual en el flujo normal);
- cada cuota **vence al inicio** del periodo que cubre (pago por adelantado);
- los ciclos son **meses de calendario** anclados al día de inicio;
- un plan nuevo **no puede empezar dentro de un periodo ya cubierto** por una cuota anterior.

### Detalles de la Implementación
1. **Modelo de datos (migración `0018_suscripcion_alumno_referencias.sql`, aditiva):** `perfiles_alumno.plan_suscrito_id` (FK a `planes_membresia`, `ON DELETE RESTRICT`), `ciclo_ancla` (día local de inicio) y `proximo_corte` (vencimiento local de la próxima cuota). `NULL` = sin plan.
2. **Contrato:** `GET`, `PUT` y `DELETE /finanzas/suscripciones/:clienteId` (rol Entrenador).
   - El primer `PUT` exige `fechaInicio` entre hoy−30 y hoy+60 días (día local del alumno) y que no caiga dentro de la cobertura vigente (vencimiento de la última cuota no anulada + duración de su plan).
   - Con suscripción vigente, el `PUT` solo cambia el plan (sin `fechaInicio`); el nuevo aplica desde la próxima cuota y el día de vencimiento no cambia.
   - `DELETE` quita el plan; las cuotas emitidas no cambian.
3. **Aritmética del ciclo** (`apps/api/src/modules/finanzas/suscripcion-ciclo.ts`, funciones puras):
   - cada vencimiento se calcula siempre desde el ancla: un plan que empieza el 31 vence el 28/02 y otra vez el 31/03;
   - la cuota se emite **5 días antes** del vencimiento (coincide con el recordatorio T-5);
   - vence al final del día local del alumno (zona del perfil, [[ADR-019-zona-horaria-perfil-captura-relativa-nutricion]]);
   - un ciclo atrasado (alumno pausado o barrido caído) salta al periodo en curso: nunca se cobran en bloque los ciclos pasados.
4. **Emisión:** el barrido diario de cobranza llama primero a `emitirCuotasProgramadas` y después evalúa los estados.
   - Recorre los alumnos activos con plan.
   - Por alumno abre una transacción con el contexto RLS del coach, bloquea la fila (`FOR UPDATE`), revalida estado y archivado, emite la cuota y avanza `proximo_corte`.
   - El índice `uq_cuota_cliente_plan_periodo` impide duplicados.
   - Un becado (override de $0.00) recibe su cuota en `al_dia`.
5. **Recordatorios:** a las 09:00 locales del alumno, también en días de cambio de horario. Si la cuota se emite el mismo día local de un hito ya pasado, ese hito sale de inmediato. Las llamadas a Redis esperan como máximo 3 s.
6. **Cobro en sala:**
   - cobra la cuota abierta más antigua;
   - sin cuota abierta, adelanta la próxima de la suscripción (sin plan → 400);
   - valida el efectivo antes de emitir, bloquea la fila del alumno, mapea el choque de cuota a 409 y acepta `x-idempotency-key`.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **C1:** El entrenador asigna un plan una vez; las cuotas, los estados y los recordatorios siguen solos.
- **C2:** "Plan del alumno" y "próximo vencimiento" son datos persistidos, no deducciones.
- **C3:** El fin de mes no desplaza los vencimientos y no se cobran ciclos atrasados en bloque.
- **C4:** No hay dos cuotas del mismo periodo por quitar y reasignar un plan.

### Consecuencias Negativas (Costos y Trade-offs)
- **T1 — Cambio de duración:** `Mensual = 30 días` de RF-005 RN-01 pasa a ser un mes de calendario.
- **T2 — Recordatorios perdidos (mitigado, `68457a6`):** la reposición diaria vuelve a agendar los hitos futuros; solo un hito del mismo día perdido no se repone.
- **T3 — Barrido con Redis caído (mitigado, `68457a6`):** tras un tiempo agotado la cola queda en pausa 60 s; el barrido espera una sola vez.
- **T4 — Ruta heredada (cerrado, `68457a6`):** `POST /finanzas/cuotas/emitir` se retiró por decisión del dueño; toda cuota sale de la suscripción.
- **T5 — Idempotencia en memoria:** la del cobro en sala vive en el proceso, igual que la del reporte de pago ([[RNF-002-consistencia-financiera-idempotencia-pagos]]).

### Riesgos Mitigados y Residuales
- **Riesgo Mitigado:** cuotas que no se emiten, cuotas duplicadas por carreras entre el barrido y el cobro en sala, doble cobro por doble clic, dos cuotas del mismo mes al reasignar un plan.
- **Riesgo Residual:** el hito del mismo día no reponible (T2) y la pausa por proceso, sin coordinar réplicas (T3).

---

## 5. Trazabilidad y Referencias
- Requerimientos asociados: [[RF-005-catalogo-planes-override-cliente]], [[RF-008-maquina-estados-cuota-recordatorios]], [[RF-009-tablero-control-cartera-morosidad]], [[RF-007-reporte-pagos-bandeja-conciliacion]], [[RNF-002-consistencia-financiera-idempotencia-pagos]].
- Decisiones relacionadas: [[ADR-008-motor-colas-background-workers-bullmq]] (cola `cobranza`), [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]] (ruta de sistema con `is_superadmin` solo para leer candidatos), [[ADR-019-zona-horaria-perfil-captura-relativa-nutricion]] (zona del perfil).
- Implementación (2026-10-09, `ee23aef`):
  - `apps/api/src/modules/finanzas/suscripcion-ciclo.ts`, `finanzas.service.ts`, `finanzas.controller.ts`, `billing-scheduler.service.ts`, `billing-reminder.processor.ts` y `cobranza-hitos.ts`;
  - `packages/database/drizzle/0018_suscripcion_alumno_referencias.sql`.
- Web (2026-10-10, `e0747e2`): `apps/web/src/lib/suscripcion-alumno.ts`, `apps/web/src/lib/cobro-sala.ts`, `apps/web/src/pages/entrenador/AlumnoDetallePage.tsx` y `CarteraPage.tsx`. La ficha escribe la tarifa ANTES del `PUT` del primer plan para que la cuota emitida en ese momento use el precio acordado.
- Evidencia:
  - tests: `apps/api/test/bdd/rf005-rf008-suscripcion-ciclo.spec.ts`, `rf005-rf008-suscripcion-servicio.spec.ts`, `rf005-rf009-m5l1-correcciones.spec.ts` y `rf007-indice-referencias.e2e.spec.ts` (PostgreSQL real, 5/5);
  - API **1447** aprobados (6 omitidos) y web **1134**;
  - migración `0018` aplicada y verificada en la BD de desarrollo;
  - revisado con los 4 enfoques y validado.

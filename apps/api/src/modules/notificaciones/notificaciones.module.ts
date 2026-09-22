import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { NotificacionesController } from './notificaciones.controller';
import { DispositivosController } from './dispositivos.controller';
import { PreferenciasNotificacionService } from './preferencias-notificacion.service';
import { DispositivosService } from './dispositivos.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { PushNotificationProcessor } from './processors/push-notification.processor';
import { EmailNotificationProcessor } from './processors/email-notification.processor';
import { ResumenSemanalProcessor } from './processors/resumen-semanal.processor';
import { ResumenSemanalSchedulerService } from './resumen-semanal.scheduler';
import {
  COLA_EMAIL,
  COLA_PUSH,
  COLA_RESUMEN_SEMANAL,
  OPCIONES_JOB_EMAIL,
  OPCIONES_JOB_PUSH,
  OPCIONES_JOB_RESUMEN_SEMANAL,
  nombreColaDlq,
} from './notificaciones.config';

/**
 * RNF-004 §4 (Ola 3): Dead-Letter Queues. No tienen worker: acumulan los jobs que agotaron
 * intentos como registro de intervención manual, visibles en Bull-Board.
 */
const COLAS_DLQ = [
  nombreColaDlq(COLA_PUSH),
  nombreColaDlq(COLA_EMAIL),
  nombreColaDlq(COLA_RESUMEN_SEMANAL),
];

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: COLA_PUSH,
        defaultJobOptions: OPCIONES_JOB_PUSH,
      },
      {
        name: COLA_EMAIL,
        defaultJobOptions: OPCIONES_JOB_EMAIL,
      },
      {
        name: COLA_RESUMEN_SEMANAL,
        defaultJobOptions: OPCIONES_JOB_RESUMEN_SEMANAL,
      },
      ...COLAS_DLQ.map((name) => ({ name }))
    ),
    // WU-H (ADR-008 §4.4) + RNF-004 §4: observabilidad de las colas y sus DLQ en Bull-Board.
    BullBoardModule.forFeature(
      { name: COLA_PUSH, adapter: BullMQAdapter },
      { name: COLA_EMAIL, adapter: BullMQAdapter },
      { name: COLA_RESUMEN_SEMANAL, adapter: BullMQAdapter },
      ...COLAS_DLQ.map((name) => ({ name, adapter: BullMQAdapter }))
    ),
  ],
  controllers: [NotificacionesController, DispositivosController],
  providers: [
    PreferenciasNotificacionService,
    DispositivosService,
    NotificationDispatcherService,
    PushNotificationProcessor,
    EmailNotificationProcessor,
    ResumenSemanalSchedulerService,
    ResumenSemanalProcessor,
  ],
  exports: [
    NotificationDispatcherService,
    PreferenciasNotificacionService,
    DispositivosService,
    BullModule,
  ],
})
export class NotificacionesModule {}

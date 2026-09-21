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

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: 'notificaciones-push',
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: 'notificaciones-email',
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 },
      }
    ),
    // WU-H (ADR-008 §4.4): observabilidad de las colas de notificación en Bull-Board.
    BullBoardModule.forFeature(
      { name: 'notificaciones-push', adapter: BullMQAdapter },
      { name: 'notificaciones-email', adapter: BullMQAdapter }
    ),
  ],
  controllers: [NotificacionesController, DispositivosController],
  providers: [
    PreferenciasNotificacionService,
    DispositivosService,
    NotificationDispatcherService,
    PushNotificationProcessor,
    EmailNotificationProcessor,
  ],
  exports: [
    NotificationDispatcherService,
    PreferenciasNotificacionService,
    DispositivosService,
    BullModule,
  ],
})
export class NotificacionesModule {}

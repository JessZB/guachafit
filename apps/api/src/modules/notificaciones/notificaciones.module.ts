import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
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
      { name: 'notificaciones-push' },
      { name: 'notificaciones-email' }
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

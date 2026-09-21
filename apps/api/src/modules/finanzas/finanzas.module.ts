import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FinanzasService } from './finanzas.service';
import { FinanzasController } from './finanzas.controller';
import { DatabaseModule } from '../../database/database.module';
import { CommonModule } from '../../common/common.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { AntropometriaModule } from '../antropometria/antropometria.module';
import { BillingSchedulerService } from './billing-scheduler.service';
import { BillingReminderProcessor } from './billing-reminder.processor';
import { COBRANZA_QUEUE } from './cobranza-hitos';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    forwardRef(() => NotificacionesModule),
    AntropometriaModule,
    // WU-H (RF-008 / ADR-008): cola de cobranza procesada DENTRO del API.
    BullModule.registerQueue({
      name: COBRANZA_QUEUE,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
    // ADR-008 §4.4: la cola se expone en el dashboard Bull-Board (/admin/queues, protegido).
    BullBoardModule.forFeature({
      name: COBRANZA_QUEUE,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [FinanzasController],
  providers: [FinanzasService, BillingSchedulerService, BillingReminderProcessor],
  exports: [FinanzasService],
})
export class FinanzasModule {}

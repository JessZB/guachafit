import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { DatabaseModule } from '../../database/database.module';
import { AntropometriaController } from './antropometria.controller';
import { AntropometriaService } from './antropometria.service';
import { R2StorageService } from './r2-storage.service';
import { AntropometriaRecordatorioSchedulerService } from './antropometria-recordatorio.scheduler';
import { AntropometriaRecordatorioProcessor } from './processors/antropometria-recordatorio.processor';
import {
  COLA_ANTROPOMETRIA_RECORDATORIO,
  OPCIONES_JOB_ANTROPOMETRIA_RECORDATORIO,
} from '../notificaciones/notificaciones.config';

/**
 * RF-003 RN-01 (WU RF-003a): la cola del recordatorio antropométrico vive con su dominio.
 *
 * No tiene Dead-Letter Queue propia: es un barrido repetible (cada hora) y un fallo agotado se
 * reintenta en la pasada siguiente para los mismos alumnos; la idempotencia del aviso está en la
 * BD (bandeja In-App por día local) y en el `jobId` determinista de push/email. Los completados se
 * retienen una semana para observarlos en Bull-Board (`/admin/queues`).
 */
@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({
      name: COLA_ANTROPOMETRIA_RECORDATORIO,
      defaultJobOptions: OPCIONES_JOB_ANTROPOMETRIA_RECORDATORIO,
    }),
    BullBoardModule.forFeature({
      name: COLA_ANTROPOMETRIA_RECORDATORIO,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [AntropometriaController],
  providers: [
    AntropometriaService,
    R2StorageService,
    AntropometriaRecordatorioSchedulerService,
    AntropometriaRecordatorioProcessor,
  ],
  exports: [AntropometriaService, R2StorageService],
})
export class AntropometriaModule {}

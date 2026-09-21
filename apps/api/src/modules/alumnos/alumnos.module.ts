import { Module } from '@nestjs/common';
import { AlumnosController } from './alumnos.controller';
import { AlumnosService } from './alumnos.service';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

// WU-E (RF-011 RN-07.4): el alta por deep link notifica al coach vía el despachador (RF-014).
@Module({
  imports: [NotificacionesModule],
  controllers: [AlumnosController],
  providers: [AlumnosService],
  exports: [AlumnosService],
})
export class AlumnosModule {}

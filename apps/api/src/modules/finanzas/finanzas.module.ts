import { Module, forwardRef } from '@nestjs/common';
import { FinanzasService } from './finanzas.service';
import { FinanzasController } from './finanzas.controller';
import { DatabaseModule } from '../../database/database.module';
import { CommonModule } from '../../common/common.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { AntropometriaModule } from '../antropometria/antropometria.module';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    forwardRef(() => NotificacionesModule),
    AntropometriaModule,
  ],
  controllers: [FinanzasController],
  providers: [FinanzasService],
  exports: [FinanzasService],
})
export class FinanzasModule {}

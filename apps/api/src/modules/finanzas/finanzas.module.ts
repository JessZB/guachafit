import { Module, forwardRef } from '@nestjs/common';
import { FinanzasService } from './finanzas.service';
import { FinanzasController } from './finanzas.controller';
import { DatabaseModule } from '../../database/database.module';
import { CommonModule } from '../../common/common.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [DatabaseModule, CommonModule, forwardRef(() => NotificacionesModule)],
  controllers: [FinanzasController],
  providers: [FinanzasService],
  exports: [FinanzasService],
})
export class FinanzasModule {}

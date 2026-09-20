import { Module } from '@nestjs/common';
import { EntrenamientoService } from './entrenamiento.service';
import { EntrenamientoController } from './entrenamiento.controller';
import { PlantillasService } from './plantillas.service';
import { PlantillasController } from './plantillas.controller';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [NotificacionesModule],
  controllers: [EntrenamientoController, PlantillasController],
  providers: [EntrenamientoService, PlantillasService],
  exports: [EntrenamientoService, PlantillasService],
})
export class EntrenamientoModule {}

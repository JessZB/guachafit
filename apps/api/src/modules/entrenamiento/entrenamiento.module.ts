import { Module } from '@nestjs/common';
import { EntrenamientoService } from './entrenamiento.service';
import { EntrenamientoController } from './entrenamiento.controller';

@Module({
  controllers: [EntrenamientoController],
  providers: [EntrenamientoService],
  exports: [EntrenamientoService],
})
export class EntrenamientoModule {}

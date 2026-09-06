import { Module } from '@nestjs/common';
import { EntrenadorController } from './entrenador.controller';
import { EntrenadorService } from './entrenador.service';

@Module({
  controllers: [EntrenadorController],
  providers: [EntrenadorService],
  exports: [EntrenadorService],
})
export class EntrenadorModule {}

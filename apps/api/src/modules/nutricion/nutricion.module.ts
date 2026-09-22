import { Module } from '@nestjs/common';
import { NutricionService } from './nutricion.service';
import { NutricionController } from './nutricion.controller';
import { AntropometriaModule } from '../antropometria/antropometria.module';

@Module({
  // RNF-001/ADR-007: la bóveda R2 (exportada por AntropometriaModule) firma las URLs de lectura
  // de las fotos de platos del diario nutricional.
  imports: [AntropometriaModule],
  controllers: [NutricionController],
  providers: [NutricionService],
  exports: [NutricionService],
})
export class NutricionModule {}

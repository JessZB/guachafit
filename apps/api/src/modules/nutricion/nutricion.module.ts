import { Module } from '@nestjs/common';
import { NutricionService } from './nutricion.service';
import { NutricionController } from './nutricion.controller';

@Module({
  controllers: [NutricionController],
  providers: [NutricionService],
  exports: [NutricionService],
})
export class NutricionModule {}

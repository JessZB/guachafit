import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AntropometriaController } from './antropometria.controller';
import { AntropometriaService } from './antropometria.service';
import { R2StorageService } from './r2-storage.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AntropometriaController],
  providers: [AntropometriaService, R2StorageService],
  exports: [AntropometriaService, R2StorageService],
})
export class AntropometriaModule {}

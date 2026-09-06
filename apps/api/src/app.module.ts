import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { AlumnosModule } from './modules/alumnos/alumnos.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { FinanzasModule } from './modules/finanzas/finanzas.module';
import { EntrenamientoModule } from './modules/entrenamiento/entrenamiento.module';
import { NutricionModule } from './modules/nutricion/nutricion.module';
import { AntropometriaModule } from './modules/antropometria/antropometria.module';
import { EntrenadorModule } from './modules/entrenador/entrenador.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    DatabaseModule,
    CommonModule,
    AuthModule,
    AlumnosModule,
    UsuariosModule,
    FinanzasModule,
    EntrenamientoModule,
    NutricionModule,
    AntropometriaModule,
    EntrenadorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

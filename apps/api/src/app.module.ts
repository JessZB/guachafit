import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { crearBullBoardAuthMiddleware } from './common/bull-board-auth.middleware';
import { crearOpcionesLimiteIntentos } from './common/guards/limite-intentos.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env', 'apps/api/.env'],
    }),
    // RF-014 RN-01 (ADR-010): bus de eventos de dominio. `wildcard: true` habilita el patrón
    // `notificacion.**` que escucha el despachador (global por defecto).
    EventEmitterModule.forRoot({ wildcard: true }),
    // A5 (LOTE API-1): opciones y almacén compartidos del límite de intentos. No hay guard global:
    // solo las rutas con `@LimitarIntentos*()` quedan limitadas. PENDIENTE: el almacén es en
    // memoria (por proceso); con varias instancias del API debe usarse uno compartido (Redis,
    // que ya existe en el proyecto) o cada instancia contará por separado.
    ThrottlerModule.forRoot(crearOpcionesLimiteIntentos()),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', '127.0.0.1'),
          port: Number(config.get<number>('REDIS_PORT', 6379)),
          maxRetriesPerRequest: null,
        },
      }),
    }),
    // WU-H (ADR-008 §4.4): Bull-Board en /admin/queues, SIEMPRE protegido. Sin
    // BULL_BOARD_USER/BULL_BOARD_PASS el middleware responde 404 (ruta deshabilitada).
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
      middleware: crearBullBoardAuthMiddleware(),
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
    NotificacionesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

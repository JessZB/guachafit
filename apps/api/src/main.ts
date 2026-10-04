import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  debeExponerSwagger,
  origenesCors,
  resumenProblemasConfiguracion,
  validarConfiguracionProduccion,
} from './common/config/validar-configuracion-produccion';
import { aplicarTrustProxy } from './common/config/trust-proxy';
import { configurarErroresGlobales } from './common/errores/filtro-errores-global';
import {
  CONSULTA_ULTIMA_MIGRACION_APLICADA,
  leerJournalDeDrizzle,
  verificarMigracionesAlArrancar,
} from './common/config/verificar-migraciones';
import { queryClient } from '@guachafit/database';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // Fail-fast de la configuración crítica: en producción, sin secretos JWT, clave de cifrado,
  // bóveda, CORS o credenciales de Bull-Board válidas el API no arranca, y el error lista todos
  // los problemas a la vez. Fuera de producción se registra un único resumen y el arranque
  // continúa; una clave de cifrado mal formada es un error en cualquier entorno.
  const { problemas, advertencias } = validarConfiguracionProduccion();
  for (const advertencia of advertencias) {
    logger.warn(advertencia);
  }
  if (process.env.NODE_ENV !== 'production' && problemas.length > 0) {
    logger.warn(resumenProblemasConfiguracion(problemas));
  }
  // Las migraciones se aplican a mano (`pnpm db:migrate`). Si falta la última, en producción el API
  // no arranca (las consultas a columnas nuevas fallarían); en desarrollo solo avisa.
  await verificarMigracionesAlArrancar({
    nodeEnv: process.env.NODE_ENV,
    leerJournal: leerJournalDeDrizzle,
    consultarUltimaAplicada: async () => {
      const filas = await queryClient.unsafe(CONSULTA_ULTIMA_MIGRACION_APLICADA);
      return (filas[0]?.created_at as string | number | undefined) ?? null;
    },
    logger,
  });
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // A5 (LOTE API-1): IP real del cliente para el límite de intentos. Desactivado por defecto
  // (se ignora X-Forwarded-For). ADR-005 despliega el API detrás de Nginx / Cloudflare: en ese
  // despliegue DEBE configurarse TRUST_PROXY (saltos de proxy o rangos de Cloudflare/Nginx);
  // si no, todos los usuarios comparten la IP del proxy y el límite los bloquea juntos.
  aplicarTrustProxy(app);

  // LOTE API-2: errores claros. ZodError no capturado → 400 con mensaje humano; error no
  // controlado → 500 genérico (el detalle solo va al log).
  configurarErroresGlobales(app);

  // Global Route Prefix. `/admin/queues` (Bull-Board, ADR-008 §4.4) queda EXCLUIDO del prefijo
  // para montarse exactamente en la ruta administrativa documentada; su protección vive en el
  // middleware de BullBoardModule (Basic Auth por env o 404 si no hay credenciales).
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'admin/queues', method: RequestMethod.ALL }],
  });

  // Enable CORS: en producción SOLO los orígenes de CORS_ORIGINS (validados al arrancar); fuera
  // de producción se conserva el origen local por defecto.
  app.enableCors({
    origin: origenesCors(),
    credentials: true,
  });

  // Swagger Documentation Setup: en producción queda oculto salvo SWAGGER_HABILITADO=true.
  const exponerSwagger = debeExponerSwagger();
  if (exponerSwagger) {
    const config = new DocumentBuilder()
      .setTitle('GUACHAFIT API')
      .setDescription('Contratos REST para el ecosistema de Alto Rendimiento y Gestión GUACHAFIT')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('entrenamientos', 'Gestión de sesiones de entrenamiento y catálogo')
      .addTag('nutricion', 'Check-ins nutricionales y adherencia')
      .addTag('antropometria', 'Mediciones y bóveda fotográfica en R2')
      .addTag('finanzas', 'Membresías, cuotas, tasas de cambio y conciliación de pagos')
      .addTag('usuarios', 'Perfil y preferencias de usuario')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`🚀 GUACHAFIT API ejecutándose en http://localhost:${port}/api/v1`);
  if (exponerSwagger) {
    logger.log(`📚 Swagger UI disponible en http://localhost:${port}/api/docs`);
  }
}

bootstrap();

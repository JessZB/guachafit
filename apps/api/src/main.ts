import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global Route Prefix
  app.setGlobalPrefix('api/v1');

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  // Swagger Documentation Setup
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

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`🚀 GUACHAFIT API ejecutándose en http://localhost:${port}/api/v1`);
  logger.log(`📚 Swagger UI disponible en http://localhost:${port}/api/docs`);
}

bootstrap();

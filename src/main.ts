import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'] });
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '100kb' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  const origins = (config.get<string>('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.enableCors({ origin: origins, credentials: true });
  }
  return app;
}

export function setupSwagger(app: NestExpressApplication) {
  const config = new DocumentBuilder()
    .setTitle('Mi Balance API')
    .setDescription(
      'API de finanzas personales. Dinero como cadenas decimales, fechas financieras YYYY-MM-DD, instantes ISO 8601 UTC. Autenticación por cookie de sesión HttpOnly + CSRF (X-CSRF-Token).',
    )
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  return document;
}

if (require.main === module) {
  void bootstrap();
}

async function bootstrap() {
  const app = await createApp();
  const config = app.get(ConfigService);
  setupSwagger(app);
  const port = Number(config.get('PORT') ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`Mi Balance API escuchando en http://localhost:${port}/api/v1`);
}

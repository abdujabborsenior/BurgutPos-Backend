import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { mkdirSync } from 'node:fs';
import { AppModule } from './app.module';
import { validationExceptionFactory } from './common/utils/validation';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService).getOrThrow<AppConfig>('app');
  const logger = new Logger('Bootstrap');

  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.use(
    helmet({
      // Uploaded images are served to the SPA, possibly from another origin in dev.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.enableCors({
    origin: config.corsOrigins.length ? config.corsOrigins : false,
    credentials: true,
  });

  mkdirSync(config.uploadDir, { recursive: true });
  app.useStaticAssets(config.uploadDir, {
    prefix: '/uploads',
    maxAge: '30d',
    immutable: true,
    index: false,
    dotfiles: 'deny',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('BurgutPOS API')
        .setDescription('Restaurant point of sale')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.port, config.host);
  logger.log(
    `BurgutPOS API is listening on http://${config.host}:${config.port}/api`,
  );
}

void bootstrap();

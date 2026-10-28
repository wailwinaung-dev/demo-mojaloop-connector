import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule, ObserveInstrument } from './app.module.js';
import express from 'express';
import { existsSync } from 'node:fs';
import { createHttpsServerOptions } from './security/tls/tls-server.helper.js';

// Pre-load .env for early bootstrap (e.g. TLS certificate loading)
if (typeof (process as any).loadEnvFile === 'function' && existsSync('.env')) {
  (process as any).loadEnvFile();
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const httpsOptions = createHttpsServerOptions();

  const app = await NestFactory.create(AppModule, {
    httpsOptions,
    instrument: ObserveInstrument,
  });

  if (httpsOptions) {
    logger.log(
      'Inbound mTLS enabled: HTTPS server initialized with client certificate verification',
    );
  } else {
    logger.log('HTTP server initialized (mTLS disabled)');
  }

  app.use(
    express.json({
      type: ['application/json', 'application/*+json'],
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(
    `Application listening on ${httpsOptions ? 'https' : 'http'}://0.0.0.0:${port}`,
  );
}
await bootstrap();

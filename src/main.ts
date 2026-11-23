import 'reflect-metadata';
import { Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { E } from './common/api-error';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { securityHeaders } from './common/security-headers.middleware';
import { config } from './config';

// One message per field: "x is required." when it is missing, otherwise the first rule it broke.
function flatten(errors: ValidationError[]): string[] {
  return errors.flatMap((e) => {
    const own = e.value === undefined ? [`${e.property} is required.`] : Object.values(e.constraints || {}).slice(0, 1);
    return [...own, ...flatten(e.children || [])];
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,   // unknown body fields are dropped (e.g. a client cannot set its own userId)
    transform: true,
    exceptionFactory: (errors) => E.badRequest('Validation failed.', flatten(errors)),
  }));

  // Optional demo front end (customer and admin pages) served from /public.
  app.useStaticAssets(join(__dirname, '..', 'public'), { extensions: ['html'], index: 'customer.html' });

  await app.listen(config.port);
  const log = new Logger('Bankko');
  log.log(`Bankko running at http://localhost:${config.port}/api/v1  (customer: /customer, admin: /admin)`);
}
bootstrap();

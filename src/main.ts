import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { requestLoggingMiddleware } from './common/interceptors/request-logging.interceptor';
import { bodyParserErrorHandler } from './common/validation/body-parser-error.handler';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';
import { Configuration } from './config/configuration';
import { SWAGGER_PATH, setupSwagger } from './config/swagger.config';

export const API_PREFIX = 'api/v1';

async function bootstrap(): Promise<void> {
  // The JSON parser is registered manually so its errors can be sanitized right after it.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get<ConfigService<Configuration, true>>(ConfigService);
  const { port } = config.get('app', { infer: true });

  app.disable('x-powered-by');
  app.use(requestLoggingMiddleware);
  app.useBodyParser('json');
  app.use(bodyParserErrorHandler);
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  setupSwagger(app);

  await app.listen(port);
  new Logger('Bootstrap').log(
    `CampusMeal API listening on port ${port} (/${API_PREFIX}, docs at /${SWAGGER_PATH})`,
  );
}

void bootstrap();

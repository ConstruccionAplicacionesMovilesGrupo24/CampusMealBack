import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api/docs';

const DESCRIPTION = `Shared REST API for the CampusMeal Android (Kotlin) and iOS (Swift) clients.

**Conventions**
- Every endpoint lives under \`/api/v1\`.
- Successful responses return the DTO directly at the JSON root. There is no \`success\`/\`data\` wrapper.
- Errors always use: \`{ statusCode, code, message, timestamp, path }\`.
- Timestamps are ISO-8601 in UTC; expiration dates use \`YYYY-MM-DD\`; prices are whole Colombian pesos (integers).
- Protected endpoints (from Issue #2) will require \`Authorization: Bearer <access token>\`.`;

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('CampusMeal API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document);
}

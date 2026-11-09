import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3001;
  const isProd = config.get<string>('nodeEnv') === 'production';

  // Phục vụ ảnh sản phẩm tĩnh tại /uploads (helmet CORP cho phép cross-origin load).
  app.useStaticAssets(join(process.cwd(), config.get<string>('uploadsDir') ?? 'uploads'), {
    prefix: '/uploads/',
  });

  // Cảnh báo nếu production còn dùng secret mặc định.
  if (isProd) {
    const def = ['dev-access-secret', 'datn-access-secret-change-in-prod'];
    if (def.includes(config.get<string>('jwt.accessSecret') ?? '')) {
      Logger.warn('⚠ JWT secret vẫn là mặc định ở production — hãy đổi!', 'Security');
    }
  }

  // Security headers; cho phép tài nguyên tĩnh (ảnh) tải từ origin khác (frontend).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Prefix + versioning: route dạng /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validation toàn cục: chỉ nhận field hợp lệ, tự ép kiểu.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Response format + logging + exception format chuẩn.
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // CORS theo allowlist (CORS_ORIGIN, phân tách bằng dấu phẩy); mặc định cho dev FE.
  const corsOrigin = config.get<string>('corsOrigin') ?? '';
  const origins = corsOrigin
    ? corsOrigin.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];
  app.enableCors({ origin: origins, credentials: true });

  // Swagger tại /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TechShop API')
    .setDescription('API TechShop — TMĐT thiết bị điện tử cũ & thu cũ đổi mới')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port);
  Logger.log(`🚀 Backend: http://localhost:${port}/api/v1`, 'Bootstrap');
  Logger.log(`📚 Swagger: http://localhost:${port}/api/docs`, 'Bootstrap');
}

void bootstrap();

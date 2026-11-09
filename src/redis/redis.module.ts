import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/** Global để mọi service inject RedisService không cần import lại (giống PrismaModule). */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}

import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

/** Global để mọi service inject CacheService không cần import lại (giống PrismaModule). */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}

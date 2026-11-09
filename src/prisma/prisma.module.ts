import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global để mọi module dùng PrismaService mà không cần import lặp lại. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

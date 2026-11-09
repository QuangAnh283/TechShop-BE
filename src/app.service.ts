import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getInfo() {
    return { name: 'TechShop API', status: 'ok' };
  }

  /** Health check: xác nhận kết nối được DB. */
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'up', timestamp: new Date().toISOString() };
  }
}

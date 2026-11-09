import { Injectable } from '@nestjs/common';
import { OrderStatus, TradeInStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** PART 11.1 — số liệu tổng quan cho dashboard (cache ngắn 30s). */
  async dashboard() {
    return this.cache.withCache('cache:admin:dashboard', 30, () => this.dashboardUncached());
  }

  private async dashboardUncached() {
    const [
      revenueAgg,
      ordersTotal,
      ordersByStatusRaw,
      productsActive,
      devicesInStock,
      tradeInByStatusRaw,
      customers,
    ] = await Promise.all([
      this.prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'PAID' } }),
      this.prisma.order.count(),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.product.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.device.count({ where: { status: 'IN_STOCK', deletedAt: null } }),
      this.prisma.tradeInRequest.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
    ]);

    const ordersByStatus = this.zeroFill(Object.values(OrderStatus));
    for (const r of ordersByStatusRaw) ordersByStatus[r.status] = r._count?._all ?? 0;

    const tradeInByStatus = this.zeroFill(Object.values(TradeInStatus));
    for (const r of tradeInByStatusRaw) tradeInByStatus[r.status] = r._count?._all ?? 0;

    return {
      totalRevenue: revenueAgg._sum.amount ?? 0,
      orders: { total: ordersTotal, byStatus: ordersByStatus },
      productsActive,
      devicesInStock,
      tradeIn: {
        total: Object.values(tradeInByStatus).reduce((a, b) => a + b, 0),
        byStatus: tradeInByStatus,
      },
      customers,
    };
  }

  /** PART 11.1 — doanh thu theo ngày (đơn đã thanh toán). */
  async revenueByDay(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const payments = await this.prisma.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: since } },
      select: { amount: true, paidAt: true },
      orderBy: { paidAt: 'asc' },
    });
    const map = new Map<string, number>();
    for (const p of payments) {
      const day = p.paidAt!.toISOString().slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + p.amount);
    }
    return [...map.entries()].map(([date, revenue]) => ({ date, revenue }));
  }

  private zeroFill<T extends string>(keys: T[]): Record<T, number> {
    return Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
  }
}

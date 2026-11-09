import { PrismaService } from '../../prisma/prisma.service';

/**
 * Gắn thông tin tồn kho bán vào danh sách Product: `priceFrom` (giá máy rẻ nhất còn hàng)
 * và `availableCount` (số máy IN_STOCK). Dùng 1 query groupBy cho cả trang (tránh N+1).
 */
export async function attachAvailability<T extends { id: string }>(
  prisma: PrismaService,
  items: T[],
): Promise<(T & { priceFrom: number | null; availableCount: number })[]> {
  if (!items.length) return [];
  const ids = items.map((i) => i.id);
  const groups = await prisma.device.groupBy({
    by: ['productId'],
    where: { productId: { in: ids }, status: 'IN_STOCK', deletedAt: null },
    _min: { sellingPrice: true },
    _count: { _all: true },
  });
  const map = new Map(groups.map((g) => [g.productId, g]));
  return items.map((i) => {
    const g = map.get(i.id);
    return {
      ...i,
      priceFrom: g?._min.sellingPrice ?? null,
      availableCount: g?._count._all ?? 0,
    };
  });
}

import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MEDIA_SELECT } from './media.util';

/** Include dùng chung cho mọi danh sách sản phẩm (Products & Search) — giữ một nguồn. */
export const PRODUCT_LIST_INCLUDE = {
  brand: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  thumbnailMedia: MEDIA_SELECT,
  _count: { select: { devices: { where: { status: 'IN_STOCK' as const } } } },
} satisfies Prisma.ProductInclude;

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

/**
 * Lọc và/hoặc sắp xếp danh sách sản phẩm theo **giá bán thực tế** — tức đúng con số hiển
 * thị trên thẻ sản phẩm (`priceFrom` = giá máy cũ rẻ nhất còn hàng), KHÔNG phải
 * `basePriceNew` (giá niêm yết của máy MỚI). Trả về một trang id đã sắp đúng thứ tự.
 *
 * Vì sao phải làm thủ công: `priceFrom` là `MIN()` trên bảng Device, Prisma không
 * `orderBy`/`where` được theo aggregate của quan hệ. Cách làm: lấy id của TOÀN BỘ sản phẩm
 * khớp bộ lọc (dùng lại nguyên `where` của Prisma nên không phải viết lại điều kiện bằng
 * SQL thô, khỏi sợ lệch logic), ghép giá bằng một `groupBy`, lọc + sắp trong bộ nhớ rồi mới
 * cắt trang. Đánh đổi: nạp id của mọi sản phẩm khớp lọc — chấp nhận được ở quy mô catalog
 * vài nghìn dòng (hiện 150). Catalog phình to thì chuyển sang cột `priceFrom` phi chuẩn hoá.
 *
 * Quy ước:
 * - Lọc khoảng giá so trên CHÍNH `priceFrom`, để sản phẩm hiện ra luôn có giá nằm trong
 *   khoảng người dùng chọn. (So trên "có máy nào đó trong khoảng" sẽ cho ra thẻ ghi 3tr
 *   khi đang lọc 5–10tr — vì thẻ hiện giá rẻ nhất.)
 * - Có lọc khoảng giá thì sản phẩm hết hàng (không có `priceFrom`) bị loại.
 * - Chỉ sắp xếp, không lọc: hết hàng xếp CUỐI ở cả hai chiều — sắp theo giá là để so giá,
 *   đẩy hàng không mua được lên đầu là vô nghĩa.
 */
export async function pageProductIdsByPrice(
  prisma: PrismaService,
  where: Prisma.ProductWhereInput,
  opts: { direction: 'asc' | 'desc' | null; minPrice?: number | null; maxPrice?: number | null },
  skip: number,
  take: number,
): Promise<{ ids: string[]; total: number }> {
  const all = await prisma.product.findMany({ where, select: { id: true, createdAt: true } });
  if (!all.length) return { ids: [], total: 0 };

  const groups = await prisma.device.groupBy({
    by: ['productId'],
    where: { productId: { in: all.map((p) => p.id) }, status: 'IN_STOCK', deletedAt: null },
    _min: { sellingPrice: true },
  });
  const priceOf = new Map(groups.map((g) => [g.productId, g._min.sellingPrice ?? null]));

  const hasRange = opts.minPrice != null || opts.maxPrice != null;
  let rows = all.map((p) => ({
    id: p.id,
    createdAt: p.createdAt,
    price: priceOf.get(p.id) ?? null,
  }));

  if (hasRange) {
    rows = rows.filter(
      (r) =>
        r.price != null &&
        (opts.minPrice == null || r.price >= opts.minPrice) &&
        (opts.maxPrice == null || r.price <= opts.maxPrice),
    );
  }

  rows.sort((a, b) => {
    if (opts.direction) {
      if (a.price === null && b.price === null) return 0;
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return opts.direction === 'asc' ? a.price - b.price : b.price - a.price;
    }
    // Không sắp theo giá -> giữ thứ tự mặc định "mới nhất".
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return { ids: rows.slice(skip, skip + take).map((r) => r.id), total: rows.length };
}

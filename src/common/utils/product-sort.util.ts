import { Prisma } from '@prisma/client';

export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/**
 * Hướng sắp xếp theo giá, hoặc `null` nếu không phải sort theo giá.
 *
 * Sort theo giá KHÔNG dùng được `orderBy` của Prisma: giá hiển thị trên thẻ sản phẩm là
 * `priceFrom` = giá máy cũ rẻ nhất còn hàng (`MIN(Device.sellingPrice) WHERE IN_STOCK`),
 * một giá trị tổng hợp từ bảng khác — Prisma không orderBy được trên aggregate của quan hệ.
 * Xem `pageProductIdsByPrice` trong product-availability.util.ts.
 */
export function priceSortDirection(sort?: string): 'asc' | 'desc' | null {
  if (sort === 'price_asc') return 'asc';
  if (sort === 'price_desc') return 'desc';
  return null;
}

/** Dựng orderBy cho danh sách sản phẩm (dùng chung cho Products & Search). */
export function buildProductOrderBy(sort?: string): Prisma.ProductOrderByWithRelationInput {
  // price_asc/price_desc được xử lý riêng (xem priceSortDirection) nên ở đây chỉ còn "mới nhất".
  void sort;
  return { createdAt: 'desc' };
}

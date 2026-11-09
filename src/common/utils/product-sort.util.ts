import { Prisma } from '@prisma/client';

export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc', 'name_asc'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** Dựng orderBy cho danh sách sản phẩm (dùng chung cho Products & Search). */
export function buildProductOrderBy(sort?: string): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case 'price_asc':
      return { basePriceNew: { sort: 'asc', nulls: 'last' } };
    case 'price_desc':
      return { basePriceNew: { sort: 'desc', nulls: 'last' } };
    case 'name_asc':
      return { name: 'asc' };
    default:
      return { createdAt: 'desc' };
  }
}

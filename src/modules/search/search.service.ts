import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { buildProductOrderBy, priceSortDirection } from '../../common/utils/product-sort.util';
import {
  attachAvailability,
  pageProductIdsByPrice,
  PRODUCT_LIST_INCLUDE,
} from '../../common/utils/product-availability.util';
import { mapProductMedia } from '../../common/utils/media.util';
import { SearchQueryDto } from './dto/search.dto';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchQueryDto) {
    const where: Prisma.ProductWhereInput = { deletedAt: null, isActive: true };
    const andConditions: Prisma.ProductWhereInput[] = [];

    // Full-text search (PostgreSQL to_tsvector qua Prisma).
    if (query.q?.trim()) {
      const tsquery = query.q
        .trim()
        .split(/\s+/)
        .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
        .filter(Boolean)
        .join(' & ');
      if (tsquery) {
        andConditions.push({
          OR: [{ name: { search: tsquery } }, { description: { search: tsquery } }],
        });
      }
    }

    if (query.category) where.category = { slug: query.category };
    if (query.brandId) where.brandId = query.brandId;
    if (query.condition) {
      where.devices = { some: { status: 'IN_STOCK', deletedAt: null, condition: query.condition } };
    }
    // Khoảng giá KHÔNG lọc ở đây: nó so trên `priceFrom` (giá máy cũ rẻ nhất còn hàng) —
    // một aggregate mà Prisma where không với tới. Xem pageProductIdsByPrice bên dưới.
    // Lọc theo spec (RAM / bộ nhớ) — khớp tên spec gần đúng + giá trị.
    if (query.ram) {
      andConditions.push({
        specs: {
          some: {
            name: { contains: 'RAM', mode: 'insensitive' },
            value: { contains: query.ram, mode: 'insensitive' },
          },
        },
      });
    }
    if (query.storage) {
      andConditions.push({
        specs: {
          some: {
            name: { contains: 'nhớ', mode: 'insensitive' },
            value: { contains: query.storage, mode: 'insensitive' },
          },
        },
      });
    }
    if (andConditions.length) where.AND = andConditions;

    const priceDir = priceSortDirection(query.sort);
    const hasRange = query.minPrice != null || query.maxPrice != null;
    if (priceDir || hasRange) {
      const { ids, total } = await pageProductIdsByPrice(
        this.prisma,
        where,
        { direction: priceDir, minPrice: query.minPrice, maxPrice: query.maxPrice },
        query.skip,
        query.limit,
      );
      const rows = ids.length
        ? await this.prisma.product.findMany({
            where: { id: { in: ids } },
            include: PRODUCT_LIST_INCLUDE,
          })
        : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ordered = ids.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => !!r);
      const withPrice = await attachAvailability(this.prisma, ordered);
      return paginate(
        withPrice.map((p) => mapProductMedia(p)),
        total,
        query.page,
        query.limit,
      );
    }

    const orderBy = buildProductOrderBy(query.sort);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: query.skip,
        take: query.limit,
        include: PRODUCT_LIST_INCLUDE,
      }),
      this.prisma.product.count({ where }),
    ]);
    const withAvailability = await attachAvailability(this.prisma, items);
    const mapped = withAvailability.map((p) => mapProductMedia(p));
    return paginate(mapped, total, query.page, query.limit);
  }
}

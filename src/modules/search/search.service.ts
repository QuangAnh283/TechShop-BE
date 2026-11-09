import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { buildProductOrderBy } from '../../common/utils/product-sort.util';
import { attachAvailability } from '../../common/utils/product-availability.util';
import { MEDIA_SELECT, mapProductMedia } from '../../common/utils/media.util';
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
    if (query.minPrice != null || query.maxPrice != null) {
      where.basePriceNew = {};
      if (query.minPrice != null) where.basePriceNew.gte = query.minPrice;
      if (query.maxPrice != null) where.basePriceNew.lte = query.maxPrice;
    }
    if (query.condition) {
      where.devices = { some: { status: 'IN_STOCK', deletedAt: null, condition: query.condition } };
    }
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

    const orderBy = buildProductOrderBy(query.sort);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: query.skip,
        take: query.limit,
        include: {
          brand: { select: { id: true, name: true, slug: true } },
          category: { select: { id: true, name: true, slug: true } },
          thumbnailMedia: MEDIA_SELECT,
          _count: { select: { devices: { where: { status: 'IN_STOCK' } } } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    const withAvailability = await attachAvailability(this.prisma, items);
    const mapped = withAvailability.map((p) => mapProductMedia(p));
    return paginate(mapped, total, query.page, query.limit);
  }
}

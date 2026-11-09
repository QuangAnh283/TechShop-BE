import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { can } from '../../common/authz/can';
import { PERM } from '../../common/authz/permissions';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import { slugify } from '../../common/utils/slug.util';
import { buildProductOrderBy } from '../../common/utils/product-sort.util';
import { attachAvailability } from '../../common/utils/product-availability.util';
import { MEDIA_SELECT, mapProductMedia } from '../../common/utils/media.util';
import { AuditService } from '../audit/audit.service';
import { CreateProductDto, ReplaceSpecsDto, UpdateProductDto } from './dto/product.dto';
import { QueryProductDto } from './dto/query-product.dto';

@Injectable()
export class ProductsService {
  /** TTL cache danh sách sản phẩm (giây). */
  private static readonly LIST_TTL = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  /** Xoá cache danh sách khi dữ liệu sản phẩm thay đổi. */
  private async invalidateListCache() {
    await this.redis.delByPattern('cache:products:*');
  }

  async create(dto: CreateProductDto) {
    const created = await this.prisma.product.create({
      data: {
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        name: dto.name,
        slug: dto.slug ? slugify(dto.slug) : slugify(dto.name),
        description: dto.description,
        thumbnailMediaId: dto.thumbnailMediaId,
        basePriceNew: dto.basePriceNew,
        images: dto.imageMediaIds?.length
          ? { create: dto.imageMediaIds.map((mediaId, i) => ({ mediaId, sortOrder: i })) }
          : undefined,
        specs: dto.specs?.length
          ? { create: dto.specs.map((s, i) => ({ name: s.name, value: s.value, sortOrder: i })) }
          : undefined,
      },
      include: {
        thumbnailMedia: MEDIA_SELECT,
        images: { include: { media: MEDIA_SELECT } },
        specs: true,
      },
    });
    await this.invalidateListCache();
    return mapProductMedia(created);
  }

  async findAll(query: QueryProductDto) {
    const cacheKey = `cache:products:list:${JSON.stringify(query)}`;
    // withCachedList lo việc dựng lại PaginatedResult sau khi lấy từ cache (xem RedisService).
    return this.redis.withCachedList(cacheKey, ProductsService.LIST_TTL, () =>
      this.findAllUncached(query),
    );
  }

  private async findAllUncached(query: QueryProductDto) {
    const where: Prisma.ProductWhereInput = { deletedAt: null };

    if (query.isActive === 'true' || query.isActive === 'false') {
      where.isActive = query.isActive === 'true';
    } else {
      where.isActive = true;
    }
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.category) where.category = { slug: query.category };
    if (query.brandId) where.brandId = query.brandId;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
    if (query.minPrice != null || query.maxPrice != null) {
      where.basePriceNew = {};
      if (query.minPrice != null) where.basePriceNew.gte = query.minPrice;
      if (query.maxPrice != null) where.basePriceNew.lte = query.maxPrice;
    }

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

  async findOne(idOrSlug: string) {
    const product = await this.prisma.product.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], deletedAt: null },
      include: {
        brand: true,
        category: true,
        thumbnailMedia: MEDIA_SELECT,
        images: { orderBy: { sortOrder: 'asc' }, include: { media: MEDIA_SELECT } },
        specs: { orderBy: { sortOrder: 'asc' } },
        devices: {
          where: { status: 'IN_STOCK', deletedAt: null },
          select: {
            id: true,
            serialImei: true,
            condition: true,
            batteryHealth: true,
            color: true,
            storage: true,
            sellingPrice: true,
            status: true,
          },
          orderBy: { sellingPrice: 'asc' },
        },
      },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    const prices = product.devices.map((d) => d.sellingPrice);
    return {
      ...mapProductMedia(product),
      availableCount: product.devices.length,
      priceFrom: prices.length ? Math.min(...prices) : null,
      priceTo: prices.length ? Math.max(...prices) : null,
    };
  }

  async update(id: string, dto: UpdateProductDto, user: AuthUser) {
    await this.ensureExists(id);
    const { imageMediaIds, specs, slug, ...rest } = dto;
    // Sửa nội dung sản phẩm không đương nhiên kèm quyền sửa giá.
    if (rest.basePriceNew !== undefined && !can(user, PERM.PRICE_UPDATE)) {
      throw new ForbiddenException('Bạn không được cấp quyền thay đổi giá');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (imageMediaIds) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (imageMediaIds.length) {
          await tx.productImage.createMany({
            data: imageMediaIds.map((mediaId, i) => ({ productId: id, mediaId, sortOrder: i })),
          });
        }
      }
      if (specs) {
        await tx.productSpec.deleteMany({ where: { productId: id } });
        if (specs.length) {
          await tx.productSpec.createMany({
            data: specs.map((s, i) => ({
              productId: id,
              name: s.name,
              value: s.value,
              sortOrder: i,
            })),
          });
        }
      }
      return tx.product.update({
        where: { id },
        data: { ...rest, slug: slug ? slugify(slug) : undefined },
        include: {
          thumbnailMedia: MEDIA_SELECT,
          images: { include: { media: MEDIA_SELECT } },
          specs: true,
        },
      });
    });
    await this.invalidateListCache();
    if (rest.basePriceNew !== undefined) {
      await this.audit.log(user, 'PRICE_UPDATE', {
        entity: 'Product',
        entityId: id,
        meta: { field: 'basePriceNew', to: rest.basePriceNew },
      });
    }
    return mapProductMedia(result);
  }

  async replaceSpecs(id: string, dto: ReplaceSpecsDto) {
    await this.ensureExists(id);
    await this.prisma.$transaction([
      this.prisma.productSpec.deleteMany({ where: { productId: id } }),
      this.prisma.productSpec.createMany({
        data: dto.specs.map((s, i) => ({
          productId: id,
          name: s.name,
          value: s.value,
          sortOrder: i,
        })),
      }),
    ]);
    const specs = await this.prisma.productSpec.findMany({
      where: { productId: id },
      orderBy: { sortOrder: 'asc' },
    });
    await this.invalidateListCache();
    return specs;
  }

  /** Ngừng bán (soft): isActive = false. */
  async deactivate(id: string) {
    await this.ensureExists(id);
    const result = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    await this.invalidateListCache();
    return result;
  }

  /** Xóa mềm. */
  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.invalidateListCache();
    return { message: 'Đã xóa sản phẩm' };
  }

  private async ensureExists(id: string) {
    const p = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!p) throw new NotFoundException('Không tìm thấy sản phẩm');
  }
}

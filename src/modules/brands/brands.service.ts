import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { slugify } from '../../common/utils/slug.util';
import { MEDIA_SELECT, toUrl } from '../../common/utils/media.util';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto';

type BrandWithLogo = { logoMedia?: { path: string } | null };

@Injectable()
export class BrandsService {
  private static readonly CACHE_KEY = 'cache:brands:all';
  private static readonly TTL = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Map logoMedia → logoUrl (giữ contract cũ cho FE). */
  private mapLogo<T extends BrandWithLogo>(brand: T): T & { logoUrl: string | null } {
    return { ...brand, logoUrl: toUrl(brand.logoMedia) };
  }

  async create(dto: CreateBrandDto) {
    const created = await this.prisma.brand.create({
      data: {
        name: dto.name,
        slug: dto.slug ? slugify(dto.slug) : slugify(dto.name),
        logoMediaId: dto.logoMediaId,
      },
      include: { logoMedia: MEDIA_SELECT },
    });
    await this.cache.del(BrandsService.CACHE_KEY);
    return this.mapLogo(created);
  }

  findAll() {
    return this.cache.withCache(BrandsService.CACHE_KEY, BrandsService.TTL, async () => {
      const brands = await this.prisma.brand.findMany({
        orderBy: { name: 'asc' },
        include: { logoMedia: MEDIA_SELECT, _count: { select: { products: true } } },
      });
      return brands.map((b) => this.mapLogo(b));
    });
  }

  async findOne(idOrSlug: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: { logoMedia: MEDIA_SELECT },
    });
    if (!brand) throw new NotFoundException('Không tìm thấy thương hiệu');
    return this.mapLogo(brand);
  }

  async update(id: string, dto: UpdateBrandDto) {
    await this.ensureExists(id);
    const updated = await this.prisma.brand.update({
      where: { id },
      data: { ...dto, slug: dto.slug ? slugify(dto.slug) : undefined },
      include: { logoMedia: MEDIA_SELECT },
    });
    await this.cache.del(BrandsService.CACHE_KEY);
    return this.mapLogo(updated);
  }

  /** Xoá thương hiệu. Kiểm trước sản phẩm đang tham chiếu — xem giải thích ở `categories.service.remove`. */
  async remove(id: string) {
    const brand = await this.ensureExists(id);

    // Không lọc `deletedAt`: sản phẩm xoá mềm vẫn giữ khoá ngoại nên vẫn chặn xoá.
    const [products, visibleProducts] = await Promise.all([
      this.prisma.product.count({ where: { brandId: id } }),
      this.prisma.product.count({ where: { brandId: id, deletedAt: null } }),
    ]);
    if (products > 0) {
      const hidden = products - visibleProducts;
      const detail =
        hidden > 0
          ? `${products} sản phẩm (trong đó ${hidden} đã xóa nhưng vẫn giữ tham chiếu)`
          : `${products} sản phẩm`;
      throw new ConflictException(
        `Không thể xóa thương hiệu “${brand.name}” vì còn ${detail} thuộc thương hiệu này. ` +
          'Hãy chuyển chúng sang thương hiệu khác trước khi xóa.',
      );
    }

    await this.prisma.brand.delete({ where: { id } });
    await this.cache.del(BrandsService.CACHE_KEY);
    return { message: 'Đã xóa thương hiệu' };
  }

  /** Trả về bản ghi để caller dùng được tên thương hiệu trong thông báo lỗi. */
  private async ensureExists(id: string) {
    const b = await this.prisma.brand.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Không tìm thấy thương hiệu');
    return b;
  }
}

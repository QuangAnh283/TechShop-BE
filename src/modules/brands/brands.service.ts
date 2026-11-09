import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
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
    private readonly redis: RedisService,
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
    await this.redis.del(BrandsService.CACHE_KEY);
    return this.mapLogo(created);
  }

  findAll() {
    return this.redis.withCache(BrandsService.CACHE_KEY, BrandsService.TTL, async () => {
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
    await this.redis.del(BrandsService.CACHE_KEY);
    return this.mapLogo(updated);
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.brand.delete({ where: { id } });
    await this.redis.del(BrandsService.CACHE_KEY);
    return { message: 'Đã xóa thương hiệu' };
  }

  private async ensureExists(id: string) {
    const b = await this.prisma.brand.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Không tìm thấy thương hiệu');
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { slugify } from '../../common/utils/slug.util';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  private static readonly CACHE_KEY = 'cache:categories:all';
  private static readonly TTL = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async create(dto: CreateCategoryDto) {
    const created = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug ? slugify(dto.slug) : slugify(dto.name),
        parentId: dto.parentId,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.cache.del(CategoriesService.CACHE_KEY);
    return created;
  }

  findAll() {
    return this.cache.withCache(CategoriesService.CACHE_KEY, CategoriesService.TTL, () =>
      this.prisma.category.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { products: true } } },
      }),
    );
  }

  async findOne(idOrSlug: string) {
    const category = await this.prisma.category.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: { children: true },
    });
    if (!category) throw new NotFoundException('Không tìm thấy danh mục');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.ensureExists(id);
    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...dto,
        slug: dto.slug ? slugify(dto.slug) : undefined,
      },
    });
    await this.cache.del(CategoriesService.CACHE_KEY);
    return updated;
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.category.delete({ where: { id } });
    await this.cache.del(CategoriesService.CACHE_KEY);
    return { message: 'Đã xóa danh mục' };
  }

  private async ensureExists(id: string) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Không tìm thấy danh mục');
  }
}

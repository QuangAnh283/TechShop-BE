import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  /**
   * Xoá danh mục. Phải KIỂM TRƯỚC các quan hệ đang trỏ tới nó.
   *
   * Khoá ngoại của `Product.categoryId` là `RESTRICT` (mặc định của Prisma cho quan hệ
   * bắt buộc), nên `category.delete()` trên danh mục còn sản phẩm làm PostgreSQL ném
   * **23001 `restrict_violation`**. Prisma chỉ map 23503 thành `P2003`, còn 23001 thì
   * không — lỗi rơi xuống nhánh cuối của `AllExceptionsFilter` và trước đây trả **HTTP
   * 500 kèm nguyên message nội bộ** (có cả đường dẫn file nguồn trên máy chủ). Kiểm
   * trước ở đây vừa cho thông báo đọc được, vừa không phụ thuộc vào việc Prisma có map
   * đúng mã lỗi hay không.
   */
  async remove(id: string) {
    const category = await this.ensureExists(id);

    // Đếm KHÔNG lọc `deletedAt`: sản phẩm xoá mềm vẫn giữ khoá ngoại nên vẫn chặn xoá.
    const [products, visibleProducts, children, questions] = await Promise.all([
      this.prisma.product.count({ where: { categoryId: id } }),
      this.prisma.product.count({ where: { categoryId: id, deletedAt: null } }),
      this.prisma.category.count({ where: { parentId: id } }),
      this.prisma.tradeInQuestion.count({ where: { categoryId: id } }),
    ]);

    // CHỈ sản phẩm mới thực sự chặn: `Product_categoryId_fkey` là RESTRICT.
    if (products > 0) {
      const hidden = products - visibleProducts;
      // Giải thích chênh lệch, nếu không người dùng thấy danh sách 20 sản phẩm mà báo 25.
      const detail =
        hidden > 0
          ? `${products} sản phẩm (trong đó ${hidden} đã xóa nhưng vẫn giữ tham chiếu)`
          : `${products} sản phẩm`;
      throw new ConflictException(
        `Không thể xóa danh mục “${category.name}” vì còn ${detail} thuộc danh mục này. ` +
          'Hãy chuyển chúng sang danh mục khác trước khi xóa.',
      );
    }

    await this.prisma.category.delete({ where: { id } });
    await this.cache.del(CategoriesService.CACHE_KEY);

    // `Category_parentId_fkey` và `TradeInQuestion_categoryId_fkey` là SET NULL nên DB
    // CHO xoá — không tự bịa thêm ràng buộc, nhưng phải nói rõ hệ quả: danh mục con bị
    // đẩy lên thành danh mục gốc, còn câu hỏi thu cũ mất phạm vi danh mục nên từ nay
    // được hỏi cho MỌI danh mục.
    const effects: string[] = [];
    if (children > 0) effects.push(`${children} danh mục con đã chuyển thành danh mục gốc`);
    if (questions > 0) effects.push(`${questions} câu hỏi thu cũ nay áp dụng cho mọi danh mục`);

    return {
      message: effects.length > 0 ? `Đã xóa danh mục. ${effects.join('; ')}.` : 'Đã xóa danh mục',
    };
  }

  /** Trả về bản ghi để caller dùng được tên danh mục trong thông báo lỗi. */
  private async ensureExists(id: string) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Không tìm thấy danh mục');
    return c;
  }
}

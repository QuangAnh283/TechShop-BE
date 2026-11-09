import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { can } from '../../common/authz/can';
import { PERM } from '../../common/authz/permissions';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateReviewDto } from './dto/review.dto';

/** Đơn ở trạng thái này coi như đã mua (verified purchase). */
const PURCHASED_STATUSES = ['CONFIRMED', 'PROCESSING', 'SHIPPING', 'DELIVERED'] as const;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateReviewDto) {
    // Phải đã mua sản phẩm (có OrderItem thuộc đơn đã xác nhận trở lên).
    const purchased = await this.prisma.orderItem.findFirst({
      where: {
        productId: dto.productId,
        order: { userId, status: { in: [...PURCHASED_STATUSES] } },
      },
    });
    if (!purchased) {
      throw new BadRequestException('Bạn chỉ có thể đánh giá sản phẩm đã mua');
    }

    const existed = await this.prisma.review.findFirst({
      where: { userId, productId: dto.productId },
    });
    if (existed) throw new BadRequestException('Bạn đã đánh giá sản phẩm này');

    return this.prisma.review.create({
      data: { userId, productId: dto.productId, rating: dto.rating, comment: dto.comment },
    });
  }

  async listByProduct(productId: string) {
    const [items, agg] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, fullName: true } } },
      }),
      this.prisma.review.aggregate({
        where: { productId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);
    return {
      items,
      summary: {
        average: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : 0,
        count: agg._count._all,
      },
    };
  }

  async remove(id: string, user: AuthUser) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá');
    // Chủ đánh giá, hoặc nhân sự được cấp quyền kiểm duyệt.
    if (review.userId !== user.id && !can(user, PERM.REVIEW_DELETE_ANY)) {
      throw new ForbiddenException('Không thể xóa đánh giá của người khác');
    }
    await this.prisma.review.delete({ where: { id } });
    return { message: 'Đã xóa đánh giá' };
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MEDIA_SELECT, toUrl } from '../../common/utils/media.util';

const ITEM_INCLUDE = {
  device: {
    include: {
      product: { select: { id: true, name: true, slug: true, thumbnailMedia: MEDIA_SELECT } },
    },
  },
} as const;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Phí ship cho một mức tiền hàng (cùng công thức với orders.createFromCart). */
  private shippingFeeFor(subtotal: number): number {
    const fee = this.config.get<number>('shipping.fee') ?? 30000;
    const freeThreshold = this.config.get<number>('shipping.freeThreshold') ?? 10000000;
    return subtotal >= freeThreshold ? 0 : fee;
  }

  private async getOrCreateCart(userId: string) {
    const existing = await this.prisma.cart.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.cart.create({ data: { userId } });
  }

  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    const rows = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: ITEM_INCLUDE,
      orderBy: { addedAt: 'desc' },
    });
    // Map media → thumbnailUrl trên product của từng device (giữ contract FE).
    const items = rows.map((it) => ({
      ...it,
      device: {
        ...it.device,
        product: it.device.product
          ? { ...it.device.product, thumbnailUrl: toUrl(it.device.product.thumbnailMedia) }
          : it.device.product,
      },
    }));
    const subtotal = items.reduce((sum, it) => sum + it.device.sellingPrice, 0);
    const shippingFee = items.length ? this.shippingFeeFor(subtotal) : 0;
    return { id: cart.id, items, subtotal, shippingFee, total: subtotal + shippingFee, count: items.length };
  }

  async addItem(userId: string, deviceId: string) {
    const cart = await this.getOrCreateCart(userId);

    const device = await this.prisma.device.findFirst({ where: { id: deviceId, deletedAt: null } });
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị');
    if (device.status !== 'IN_STOCK') {
      throw new ConflictException('Thiết bị không còn khả dụng');
    }

    // Giỏ KHÔNG giữ chỗ: người khác cũng được để device này trong giỏ của họ.
    // Ai checkout trước thì thắng (orders.createFromCart khóa hàng bằng SELECT ... FOR UPDATE).
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_deviceId: { cartId: cart.id, deviceId } },
    });
    if (existing) throw new BadRequestException('Thiết bị đã có trong giỏ');

    await this.prisma.cartItem.create({ data: { cartId: cart.id, deviceId } });
    return this.getCart(userId);
  }

  async removeItem(userId: string, deviceId: string) {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.prisma.cartItem.findFirst({ where: { cartId: cart.id, deviceId } });
    if (!item) throw new NotFoundException('Không có thiết bị này trong giỏ');
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    return this.getCart(userId);
  }

  async clear(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return { message: 'Đã xóa toàn bộ giỏ hàng' };
  }

  /** PART 7.2 — kiểm tra giỏ trước khi checkout. */
  async validate(userId: string) {
    const { items } = await this.getCart(userId);
    const issues: { deviceId: string; reason: string }[] = [];
    for (const it of items) {
      if (it.device.deletedAt) issues.push({ deviceId: it.deviceId, reason: 'Thiết bị đã bị xóa' });
      else if (it.device.status !== 'IN_STOCK') {
        issues.push({ deviceId: it.deviceId, reason: 'Thiết bị không còn khả dụng' });
      }
    }
    return { valid: issues.length === 0 && items.length > 0, itemCount: items.length, issues };
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeviceStatus, OrderStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { can } from '../../common/authz/can';
import { PERM } from '../../common/authz/permissions';
import { paginate } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { MEDIA_SELECT, toUrl } from '../../common/utils/media.util';
import { AuditService } from '../audit/audit.service';
import { CreateOrderDto, QueryOrderDto } from './dto/order.dto';

/** Map media → thumbnailUrl cho từng item.product của đơn (giữ contract FE). */
function mapOrderMedia<T extends { items?: any[] }>(order: T): T {
  if (!order?.items) return order;
  return {
    ...order,
    items: order.items.map((it) => ({
      ...it,
      product: it.product
        ? { ...it.product, thumbnailUrl: toUrl(it.product.thumbnailMedia) }
        : it.product,
    })),
  };
}

/** Chuyển trạng thái hợp lệ (PART 8.3). */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

const ORDER_INCLUDE = {
  items: {
    include: {
      device: {
        select: {
          id: true,
          serialImei: true,
          condition: true,
          color: true,
          storage: true,
          batteryHealth: true,
        },
      },
      product: { select: { id: true, name: true, slug: true, thumbnailMedia: MEDIA_SELECT } },
    },
  },
  payment: true,
  address: true,
  user: { select: { id: true, email: true, fullName: true } },
} as const;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /** PART 8.1 + 8.2 — tạo đơn từ giỏ, transaction + khóa hàng chống race condition. */
  async createFromCart(userId: string, dto: CreateOrderDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: true },
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Giỏ hàng trống');
    }
    const deviceIds = cart.items.map((i) => i.deviceId);

    if (dto.addressId) {
      const addr = await this.prisma.address.findFirst({
        where: { id: dto.addressId, userId },
      });
      if (!addr) throw new BadRequestException('Địa chỉ không hợp lệ');
    }

    return this.prisma.$transaction(async (tx) => {
      // Khóa các device để không ai mua song song cùng lúc.
      const locked = await tx.$queryRaw<
        {
          id: string;
          status: DeviceStatus;
          sellingPrice: number;
          productId: string;
          name: string;
        }[]
      >(
        // ORDER BY d.id: khóa theo thứ tự cố định để 2 đơn có device trùng nhau
        // không khóa ngược chiều -> tránh deadlock (Postgres sẽ abort 1 bên thành lỗi 500).
        Prisma.sql`SELECT d.id, d.status, d."sellingPrice", d."productId", p.name
                   FROM "Device" d JOIN "Product" p ON p.id = d."productId"
                   WHERE d.id IN (${Prisma.join(deviceIds)})
                   ORDER BY d.id
                   FOR UPDATE OF d`,
      );

      if (locked.length !== deviceIds.length) {
        throw new ConflictException('Một số thiết bị không còn tồn tại');
      }
      const unavailable = locked.filter((d) => d.status !== DeviceStatus.IN_STOCK);
      if (unavailable.length) {
        throw new ConflictException(
          `Thiết bị không còn khả dụng: ${unavailable.map((d) => d.id).join(', ')}`,
        );
      }

      const subtotal = locked.reduce((s, d) => s + d.sellingPrice, 0);
      // Phí ship cố định, miễn phí khi tổng tiền hàng đạt ngưỡng (cấu hình qua env).
      const shipFee = this.config.get<number>('shipping.fee') ?? 30000;
      const freeThreshold = this.config.get<number>('shipping.freeThreshold') ?? 10000000;
      const shippingFee = subtotal >= freeThreshold ? 0 : shipFee;
      const total = subtotal + shippingFee;

      // A1: GIỮ CHỖ (RESERVED), chưa bán hẳn. Chỉ SOLD khi đã thanh toán.
      await tx.device.updateMany({
        where: { id: { in: deviceIds } },
        data: { status: DeviceStatus.RESERVED },
      });

      // Tạo đơn + items (snapshot giá & tên). OrderItem.deviceId unique = lớp chặn bán trùng.
      const order = await tx.order.create({
        data: {
          orderNumber: this.genOrderNumber(),
          userId,
          status: OrderStatus.PENDING,
          subtotal,
          shippingFee,
          total,
          addressId: dto.addressId,
          note: dto.note,
          items: {
            create: locked.map((d) => ({
              deviceId: d.id,
              productId: d.productId,
              unitPrice: d.sellingPrice,
              nameSnapshot: d.name,
            })),
          },
          payment: {
            create: { amount: total, status: 'PENDING', provider: dto.paymentMethod ?? 'VNPAY' },
          },
        },
        include: ORDER_INCLUDE,
      });

      // Chỉ dọn giỏ của người mua. Device vừa bán vẫn nằm lại trong giỏ người khác,
      // nhưng hiện rõ là "đã có người đặt mất" (trang giỏ đọc device.status) thay vì
      // lặng lẽ biến mất — giống cách marketplace đánh dấu hàng hết thay vì xoá hộ khách.
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return mapOrderMedia(order);
    });
  }

  async findAllForUser(userId: string, query: QueryOrderDto) {
    const where: Prisma.OrderWhereInput = { userId };
    if (query.status) where.status = query.status;
    return this.paginateOrders(where, query);
  }

  async findAll(query: QueryOrderDto) {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    return this.paginateOrders(where, query);
  }

  async findOne(id: string, user: AuthUser) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    // Chủ đơn, hoặc nhân sự được cấp quyền xem toàn bộ đơn. Trước đây chỉ chặn
    // CUSTOMER nên mọi nhân viên đọc được đơn của bất kỳ ai.
    if (order.userId !== user.id && !can(user, PERM.ORDER_READ_ALL)) {
      throw new ForbiddenException('Không thể xem đơn hàng của người khác');
    }
    return mapOrderMedia(order);
  }

  /** PART 8.3 — đổi trạng thái theo luồng hợp lệ (kèm side-effect kho/thanh toán). */
  async updateStatus(id: string, next: OrderStatus, user?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { payment: true, items: { select: { deviceId: true } } },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    if (!TRANSITIONS[order.status].includes(next)) {
      throw new BadRequestException(`Không thể chuyển ${order.status} -> ${next}`);
    }
    if (next === OrderStatus.CANCELLED) {
      const res = await this.cancelInternal(order.id);
      await this.audit.log(user, 'ORDER_CANCEL', {
        entity: 'Order',
        entityId: id,
        meta: { orderNumber: order.orderNumber, from: order.status },
      });
      return res;
    }

    // Đơn VNPay chỉ được xác nhận bởi callback đã thanh toán (handleVnpayReturn).
    // Chặn admin xác nhận tay, nếu không đơn sẽ đi tới DELIVERED mà payment kẹt PENDING mãi.
    if (
      next === OrderStatus.CONFIRMED &&
      order.payment?.provider === 'VNPAY' &&
      order.payment.status !== 'PAID'
    ) {
      throw new BadRequestException(
        'Đơn VNPay chưa thanh toán nên không thể xác nhận thủ công. Hãy chờ khách thanh toán, hoặc hủy đơn.',
      );
    }

    const deviceIds = order.items.map((i) => i.deviceId);
    const result = await this.prisma.$transaction(async (tx) => {
      // Xác nhận đơn = chốt bán -> device SOLD.
      if (next === OrderStatus.CONFIRMED && deviceIds.length) {
        await tx.device.updateMany({ where: { id: { in: deviceIds } }, data: { status: 'SOLD' } });
      }
      // Giao thành công với COD -> thu tiền (payment PAID).
      if (
        next === OrderStatus.DELIVERED &&
        order.payment?.provider === 'COD' &&
        order.payment.status === 'PENDING'
      ) {
        await tx.payment.update({
          where: { id: order.payment.id },
          data: { status: 'PAID', paidAt: new Date() },
        });
      }
      const updated = await tx.order.update({
        where: { id },
        data: { status: next },
        include: ORDER_INCLUDE,
      });
      return mapOrderMedia(updated);
    });
    await this.audit.log(user, 'ORDER_STATUS_CHANGE', {
      entity: 'Order',
      entityId: id,
      meta: { orderNumber: order.orderNumber, from: order.status, to: next },
    });
    return result;
  }

  /**
   * Hoàn tiền đơn đã thanh toán (PAID): ghi nhận REFUNDED + hoàn kho + đóng đơn (CANCELLED) + audit.
   * Không gọi API VNPay (thực tế kế toán hoàn tay). Cho phép cả đơn đã DELIVERED (khách trả hàng).
   */
  async refund(id: string, user: AuthUser, reason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { payment: true, items: { select: { deviceId: true } } },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    if (order.payment?.status !== 'PAID') {
      throw new BadRequestException('Chỉ hoàn tiền cho đơn đã thanh toán (PAID)');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      // Khóa Payment, đọc lại để tránh hoàn tiền hai lần song song.
      const rows = await tx.$queryRaw<{ id: string; status: string }[]>(
        Prisma.sql`SELECT id, status FROM "Payment" WHERE "orderId" = ${id} FOR UPDATE`,
      );
      if (rows[0]?.status !== 'PAID') {
        throw new BadRequestException('Đơn không còn ở trạng thái đã thanh toán');
      }
      await tx.device.updateMany({
        where: {
          id: { in: order.items.map((i) => i.deviceId) },
          status: { in: [DeviceStatus.RESERVED, DeviceStatus.SOLD] },
        },
        data: { status: DeviceStatus.IN_STOCK },
      });
      await tx.payment.update({
        where: { id: rows[0].id },
        data: { status: 'REFUNDED', refundedAt: new Date() },
      });
      const updated = await tx.order.update({
        where: { id },
        data: { status: OrderStatus.CANCELLED },
        include: ORDER_INCLUDE,
      });
      return mapOrderMedia(updated);
    });
    await this.audit.log(user, 'ORDER_REFUND', {
      entity: 'Order',
      entityId: id,
      meta: { orderNumber: order.orderNumber, amount: order.total, reason: reason ?? null },
    });
    return result;
  }

  async cancel(id: string, user: AuthUser) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    // Chủ đơn, hoặc nhân sự được cấp quyền hủy đơn hộ khách. Trước đây chỉ chặn
    // CUSTOMER nên mọi nhân viên hủy được đơn của bất kỳ ai.
    if (order.userId !== user.id && !can(user, PERM.ORDER_CANCEL_ANY)) {
      throw new ForbiddenException('Không thể hủy đơn của người khác');
    }
    if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
      throw new BadRequestException('Chỉ hủy được đơn khi chưa xử lý/giao');
    }
    return this.cancelInternal(order.id);
  }

  // ---------- Helpers ----------
  /**
   * Hủy đơn + hoàn kho + đánh dấu thanh toán, trong 1 transaction.
   *
   * `onlyIfPendingUnpaid` dành cho cron tự hủy: khóa dòng Payment trước rồi đọc lại
   * trạng thái, nếu đơn vừa được thanh toán xong (PAID) hoặc đã rời PENDING thì BỎ QUA.
   * Thiếu guard này, cron có thể hủy đúng đơn khách vừa trả tiền (payment PAID -> REFUNDED
   * dù chưa hoàn đồng nào). Khóa Payment trước cũng trùng thứ tự khóa của handleVnpayReturn.
   */
  private async cancelInternal(orderId: string, opts: { onlyIfPendingUnpaid?: boolean } = {}) {
    return this.prisma.$transaction(async (tx) => {
      const paymentRows = await tx.$queryRaw<{ id: string; status: string }[]>(
        Prisma.sql`SELECT id, status FROM "Payment" WHERE "orderId" = ${orderId} FOR UPDATE`,
      );
      const payment = paymentRows[0];

      if (opts.onlyIfPendingUnpaid) {
        const fresh = await tx.order.findUnique({
          where: { id: orderId },
          select: { status: true },
        });
        if (fresh?.status !== OrderStatus.PENDING || payment?.status === 'PAID') return null;
      }

      const items = await tx.orderItem.findMany({ where: { orderId } });
      // Hoàn kho: CHỈ device đang bị đơn này giữ (RESERVED/SOLD) mới trở lại IN_STOCK —
      // không đụng tới máy đã bị chuyển DEFECTIVE/INSPECTING trong lúc đơn còn treo.
      await tx.device.updateMany({
        where: {
          id: { in: items.map((i) => i.deviceId) },
          status: { in: [DeviceStatus.RESERVED, DeviceStatus.SOLD] },
        },
        data: { status: DeviceStatus.IN_STOCK },
      });
      // Đã trả tiền -> REFUNDED; chưa trả -> FAILED.
      await tx.payment.updateMany({
        where: { orderId, status: 'PAID' },
        data: { status: 'REFUNDED' },
      });
      await tx.payment.updateMany({
        where: { orderId, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      const cancelled = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
        include: ORDER_INCLUDE,
      });
      return mapOrderMedia(cancelled);
    });
  }

  /** A1 — tự hủy đơn PENDING quá hạn chưa thanh toán, trả máy về kho. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireStaleOrders() {
    const ttlMin = this.config.get<number>('orderPendingTtlMinutes') ?? 30;
    const cutoff = new Date(Date.now() - ttlMin * 60 * 1000);
    const stale = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        createdAt: { lt: cutoff },
        // Chỉ tự hủy đơn VNPay chưa trả tiền. COD giữ PENDING cho tới khi admin xử lý.
        payment: { is: { provider: 'VNPAY', status: { not: 'PAID' } } },
      },
      select: { id: true },
    });
    if (stale.length === 0) return;
    let cancelled = 0;
    for (const o of stale) {
      try {
        // Danh sách trên đọc ngoài transaction nên có thể đã cũ — cancelInternal
        // kiểm tra lại dưới khóa và trả null nếu đơn vừa được thanh toán.
        if (await this.cancelInternal(o.id, { onlyIfPendingUnpaid: true })) cancelled++;
      } catch (e) {
        this.logger.error(`Hủy đơn quá hạn ${o.id} lỗi: ${(e as Error).message}`);
      }
    }
    if (cancelled) {
      this.logger.log(
        `Đã tự hủy ${cancelled}/${stale.length} đơn PENDING quá hạn (${ttlMin} phút).`,
      );
    }
  }

  private async paginateOrders(where: Prisma.OrderWhereInput, query: QueryOrderDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: ORDER_INCLUDE,
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginate(
      items.map((o) => mapOrderMedia(o)),
      total,
      query.page,
      query.limit,
    );
  }

  private genOrderNumber(): string {
    return `OD${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`;
  }
}

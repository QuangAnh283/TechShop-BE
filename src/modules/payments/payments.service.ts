import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VnpayProvider } from './providers/vnpay.provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly vnpay: VnpayProvider,
  ) {}

  /** PART 9.2 — tạo URL thanh toán VNPay cho đơn hàng. */
  async createVnpayUrl(orderId: string, userId: string, ipAddr: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    if (order.userId !== userId) throw new BadRequestException('Đơn hàng không thuộc về bạn');
    if (!order.payment) throw new BadRequestException('Đơn hàng chưa có bản ghi thanh toán');
    if (order.payment.status === 'PAID') throw new BadRequestException('Đơn hàng đã thanh toán');
    if (order.status === OrderStatus.CANCELLED) throw new BadRequestException('Đơn hàng đã hủy');

    const txnRef = `${order.orderNumber}-${Date.now()}`;
    await this.prisma.payment.update({
      where: { id: order.payment.id },
      data: { transactionRef: txnRef, provider: 'VNPAY' },
    });

    const paymentUrl = this.vnpay.createPaymentUrl({
      orderId: order.id,
      txnRef,
      amount: order.total,
      orderInfo: `Thanh toan don hang ${order.orderNumber}`,
      ipAddr,
    });
    return { paymentUrl };
  }

  /**
   * Xử lý callback/return + IPN từ VNPay (PART 9.2) — ACID.
   *  - Verify chữ ký HMAC trước (không tin dữ liệu client).
   *  - Khóa dòng Payment (FOR UPDATE) trong transaction → idempotent, chống xử lý 2 lần
   *    khi return & IPN đến song song / IPN retry.
   *  - Chặn thanh toán cho đơn đã HỦY.
   *  - Khi thành công: Payment PAID + Order CONFIRMED + Device -> SOLD (cùng 1 transaction).
   */
  async handleVnpayReturn(query: Record<string, string>) {
    const result = this.vnpay.verify(query);

    // Chặn sớm callback giả mạo — không chạm DB nếu chữ ký sai.
    if (!result.signatureValid) {
      this.logger.warn(`VNPay callback chữ ký không hợp lệ cho ${result.txnRef}`);
      return { success: false, message: 'Chữ ký không hợp lệ' };
    }

    return this.prisma.$transaction(async (tx) => {
      // Khóa dòng payment theo transactionRef.
      const rows = await tx.$queryRaw<
        { id: string; status: string; amount: number; orderId: string }[]
      >(
        Prisma.sql`SELECT id, status, amount, "orderId" FROM "Payment"
                   WHERE "transactionRef" = ${result.txnRef} FOR UPDATE`,
      );
      const payment = rows[0];
      if (!payment) {
        this.logger.warn(`VNPay callback: không tìm thấy payment ${result.txnRef}`);
        return { success: false, message: 'Không tìm thấy giao dịch' };
      }

      // Idempotent: đã xử lý thành công trước đó.
      if (payment.status === 'PAID') {
        return { success: true, message: 'Đơn đã thanh toán', orderId: payment.orderId };
      }

      const order = await tx.order.findUnique({
        where: { id: payment.orderId },
        include: { items: { select: { deviceId: true } } },
      });

      // A2: không nhận thanh toán cho đơn đã hủy (tiền thật đã thu -> cần hoàn thủ công).
      if (order?.status === OrderStatus.CANCELLED) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'PAID', paidAt: new Date(), providerData: result.providerData },
        });
        this.logger.warn(`Thanh toán cho đơn ĐÃ HỦY ${payment.orderId} — cần hoàn tiền thủ công.`);
        return {
          success: false,
          message: 'Đơn đã bị hủy trước khi thanh toán. Khoản tiền sẽ được hoàn lại.',
          orderId: payment.orderId,
        };
      }

      if (result.success && result.amount === payment.amount) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'PAID', paidAt: new Date(), providerData: result.providerData },
        });
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.CONFIRMED },
        });
        // A1: chốt bán hẳn -> device SOLD.
        const deviceIds = order?.items.map((i) => i.deviceId) ?? [];
        if (deviceIds.length) {
          await tx.device.updateMany({
            where: { id: { in: deviceIds } },
            data: { status: 'SOLD' },
          });
        }
        return { success: true, message: 'Thanh toán thành công', orderId: payment.orderId };
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', providerData: result.providerData },
      });
      return { success: false, message: 'Thanh toán thất bại', orderId: payment.orderId };
    });
  }
}

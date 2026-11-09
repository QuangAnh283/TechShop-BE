import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';

/** Test state machine đổi trạng thái đơn (PART 8.3) với Prisma mock. */
describe('OrdersService.updateStatus', () => {
  const makeService = (status: string) => {
    const order = { id: 'o1', status, items: [{ deviceId: 'd1' }], payment: null };
    const update = jest.fn().mockResolvedValue({ id: 'o1', status: 'CONFIRMED' });
    const tx = {
      order: { update },
      device: { updateMany: jest.fn().mockResolvedValue({}) },
      payment: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const config = { get: jest.fn().mockReturnValue(30) };
    const audit = { log: jest.fn() };
    return {
      svc: new OrdersService(prisma as never, config as never, audit as never),
      update,
      deviceUpdateMany: tx.device.updateMany,
    };
  };

  it('PENDING -> CONFIRMED hợp lệ + device SOLD', async () => {
    const { svc, update, deviceUpdateMany } = makeService('PENDING');
    await svc.updateStatus('o1', 'CONFIRMED' as never);
    expect(update).toHaveBeenCalled();
    expect(deviceUpdateMany).toHaveBeenCalled();
  });

  it('PENDING -> SHIPPING không hợp lệ -> BadRequest', async () => {
    const { svc } = makeService('PENDING');
    await expect(svc.updateStatus('o1', 'SHIPPING' as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('DELIVERED là trạng thái cuối -> mọi chuyển tiếp đều lỗi', async () => {
    const { svc } = makeService('DELIVERED');
    await expect(svc.updateStatus('o1', 'CANCELLED' as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

/**
 * Test guard của cron tự hủy đơn quá hạn.
 *
 * Bug đã sửa 2026-10-19: cron đọc danh sách đơn quá hạn NGOÀI transaction rồi mới hủy từng đơn,
 * nên có cửa sổ khách thanh toán xong ngay giữa hai bước → cron hủy đúng đơn vừa trả tiền
 * (payment PAID → REFUNDED dù chưa hoàn đồng nào). Nay cancelInternal khóa Payment rồi đọc lại
 * trạng thái dưới khóa, và bỏ qua nếu đơn đã rời PENDING hoặc đã PAID.
 */
describe('OrdersService.expireStaleOrders', () => {
  /** Hai tham số = trạng thái ĐỌC ĐƯỢC DƯỚI KHÓA, tức sau khi callback VNPay đã kịp chạy. */
  const makeService = (paymentStatusUnderLock: string, orderStatusUnderLock: string) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'p1', status: paymentStatusUnderLock }]),
      order: {
        findUnique: jest.fn().mockResolvedValue({ status: orderStatusUnderLock }),
        update: jest.fn().mockResolvedValue({ id: 'o1', status: 'CANCELLED' }),
      },
      orderItem: { findMany: jest.fn().mockResolvedValue([{ deviceId: 'd1' }]) },
      device: { updateMany: jest.fn().mockResolvedValue({}) },
      payment: { updateMany: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      // Cron nhìn thấy đơn này là PENDING & chưa trả tiền (ảnh chụp đã cũ).
      order: { findMany: jest.fn().mockResolvedValue([{ id: 'o1' }]) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const config = { get: jest.fn().mockReturnValue(30) };
    const audit = { log: jest.fn() };
    return { svc: new OrdersService(prisma as never, config as never, audit as never), tx };
  };

  it('đơn vừa được thanh toán xong -> KHÔNG hủy, không đụng payment/device', async () => {
    const { svc, tx } = makeService('PAID', 'CONFIRMED');
    await svc.expireStaleOrders();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(tx.device.updateMany).not.toHaveBeenCalled();
  });

  it('đơn vẫn PENDING & chưa trả tiền -> hủy và hoàn kho như thường', async () => {
    const { svc, tx } = makeService('PENDING', 'PENDING');
    await svc.expireStaleOrders();
    expect(tx.order.update).toHaveBeenCalled();
    expect(tx.device.updateMany).toHaveBeenCalled();
  });
});

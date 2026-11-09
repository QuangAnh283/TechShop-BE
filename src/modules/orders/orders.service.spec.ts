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

/**
 * Hoàn tiền (vá 2026-11-09).
 *
 * Lỗi đã vá: hoàn tiền trả máy về kho VÔ ĐIỀU KIỆN. Với đơn đã DELIVERED, máy đang ở
 * chỗ khách — nhập kho lúc đó là tạo ra một máy "ma" được rao bán trong khi khách vẫn giữ nó.
 */
describe('OrdersService.refund', () => {
  const makeService = (orderStatus: string) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'p1', status: 'PAID' }]),
      order: {
        findUnique: jest.fn().mockResolvedValue({ status: orderStatus }),
        update: jest.fn().mockResolvedValue({ id: 'o1', status: 'CANCELLED', items: [] }),
      },
      orderItem: { findMany: jest.fn().mockResolvedValue([{ deviceId: 'd1' }]) },
      device: { updateMany: jest.fn().mockResolvedValue({}) },
      payment: { updateMany: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1',
          orderNumber: 'OD1',
          total: 1000,
          status: orderStatus,
          payment: { status: 'PAID' },
        }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const config = { get: jest.fn().mockReturnValue(30) };
    const audit = { log: jest.fn() };
    return {
      svc: new OrdersService(prisma as never, config as never, audit as never),
      tx,
      audit,
    };
  };
  const admin = { id: 'a1', email: 'a@b.c', role: 'ADMIN', permissions: ['*'] } as never;

  it('đơn CHƯA giao xong -> hoàn kho tự động (hàng còn trong tầm kiểm soát)', async () => {
    const { svc, tx } = makeService('CONFIRMED');
    await svc.refund('o1', admin);
    expect(tx.device.updateMany).toHaveBeenCalled();
  });

  it('đơn ĐÃ GIAO mà chưa nhận lại hàng -> KHÔNG hoàn kho', async () => {
    const { svc, tx } = makeService('DELIVERED');
    await svc.refund('o1', admin);
    expect(tx.device.updateMany).not.toHaveBeenCalled();
    expect(tx.payment.updateMany).toHaveBeenCalled(); // tiền vẫn được ghi nhận hoàn
    expect(tx.order.update).toHaveBeenCalled(); // đơn vẫn được đóng
  });

  it('đơn ĐÃ GIAO + xác nhận khách trả lại máy -> mới hoàn kho', async () => {
    const { svc, tx } = makeService('DELIVERED');
    await svc.refund('o1', admin, { goodsReturned: true });
    expect(tx.device.updateMany).toHaveBeenCalled();
  });

  it('audit giữ lại trạng thái TRƯỚC khi hoàn (hủy vs đã giao rồi trả lại)', async () => {
    const { svc, audit } = makeService('DELIVERED');
    await svc.refund('o1', admin);
    expect(audit.log).toHaveBeenCalledWith(
      admin,
      'ORDER_REFUND',
      expect.objectContaining({
        meta: expect.objectContaining({ from: 'DELIVERED', stockRestored: false }),
      }),
    );
  });
});

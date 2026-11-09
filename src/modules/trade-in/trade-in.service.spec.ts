import { BadRequestException } from '@nestjs/common';
import { TradeInService } from './trade-in.service';

/** Test pricing engine (PART 10.2/10.3) với Prisma mock. */
describe('TradeInService.estimate', () => {
  const audit = { log: jest.fn() };
  const makeService = (rule: unknown, options: unknown[]) => {
    const prisma = {
      tradeInRule: { findUnique: jest.fn().mockResolvedValue(rule) },
      tradeInOption: { findMany: jest.fn().mockResolvedValue(options) },
    };
    return new TradeInService(prisma as never, audit as never);
  };

  it('tính giá = base + tổng điều chỉnh', async () => {
    const svc = makeService(
      { basePrice: 10_000_000, isActive: true, product: { id: 'p1', name: 'iPhone' } },
      [
        {
          id: 'o1',
          questionId: 'q1',
          label: 'Trầy nhẹ',
          priceAdjustment: -500_000,
          question: { id: 'q1', text: 'Màn hình?' },
        },
        {
          id: 'o2',
          questionId: 'q2',
          label: 'Pin <80%',
          priceAdjustment: -300_000,
          question: { id: 'q2', text: 'Pin?' },
        },
      ],
    );
    const r = await svc.estimate({ productId: 'p1', optionIds: ['o1', 'o2'] });
    expect(r.basePrice).toBe(10_000_000);
    expect(r.totalAdjustment).toBe(-800_000);
    expect(r.estimatedPrice).toBe(9_200_000);
    expect(r.breakdown).toHaveLength(2);
  });

  it('giá không âm (floor 0)', async () => {
    const svc = makeService(
      { basePrice: 1_000_000, isActive: true, product: { id: 'p1', name: 'X' } },
      [
        {
          id: 'o1',
          questionId: 'q1',
          label: 'Hỏng nặng',
          priceAdjustment: -5_000_000,
          question: { id: 'q1', text: '?' },
        },
      ],
    );
    const r = await svc.estimate({ productId: 'p1', optionIds: ['o1'] });
    expect(r.estimatedPrice).toBe(0);
  });

  it('không có rule -> BadRequest', async () => {
    const svc = makeService(null, []);
    await expect(svc.estimate({ productId: 'x', optionIds: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('option không hợp lệ -> BadRequest', async () => {
    const svc = makeService(
      { basePrice: 1000, isActive: true, product: { id: 'p', name: 'X' } },
      [],
    );
    await expect(
      svc.estimate({ productId: 'p', optionIds: ['khong-ton-tai'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

/** Test state machine thu cũ sau thiết kế lại (một nguồn luật TI_TRANSITIONS). */
describe('TradeInService — state machine', () => {
  // Prisma mock chung: findUnique trả về request giả, update/findUniqueOrThrow phản chiếu data.
  const makeSvc = (request: Record<string, unknown>) => {
    const update = jest.fn().mockImplementation(({ data }) => ({ ...request, ...data }));
    const prisma = {
      tradeInRequest: {
        findUnique: jest.fn().mockResolvedValue(request),
        update,
        findUniqueOrThrow: jest.fn().mockResolvedValue(request),
      },
    };
    const audit = { log: jest.fn() };
    return { svc: new TradeInService(prisma as never, audit as never), update };
  };
  const customer = { id: 'u1', email: '', role: 'CUSTOMER', permissions: [] } as never;

  it('inspect báo giá được NGAY từ PENDING (khách không gửi máy trước)', async () => {
    const { svc } = makeSvc({ id: 'r1', status: 'PENDING' });
    // Không ném lỗi trạng thái nữa; dừng ở bước $transaction chưa mock là đủ chứng minh
    // nó đã qua được assertTransition.
    await expect(
      svc.inspect('r1', 'tech', { adjustedPrice: 1000 } as never),
    ).rejects.not.toBeInstanceOf(BadRequestException);
  });

  it('inspect bị chặn khi đã chốt xong (ACCEPTED)', async () => {
    const { svc } = makeSvc({ id: 'r1', status: 'ACCEPTED' });
    await expect(
      svc.inspect('r1', 'tech', { adjustedPrice: 1000 } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('khách từ chối báo giá -> CUSTOMER_DECLINED (không phải REJECTED)', async () => {
    const { svc, update } = makeSvc({ id: 'r1', status: 'OFFERED', userId: 'u1' });
    await svc.respond('r1', customer, false);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CUSTOMER_DECLINED' } }),
    );
  });

  it('respond bị chặn khi chưa OFFERED', async () => {
    const { svc } = makeSvc({ id: 'r1', status: 'PENDING', userId: 'u1' });
    await expect(svc.respond('r1', customer, true)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateStatus chặn bước nhảy không hợp lệ (PENDING -> COMPLETED)', async () => {
    const { svc } = makeSvc({ id: 'r1', status: 'PENDING' });
    await expect(svc.updateStatus('r1', 'COMPLETED' as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // KTV không sửa báo giá mà đồng ý luôn: PENDING -> ACCEPTED, và giá chốt phải được
  // ghi bằng chính giá ước tính khách đã thấy, nếu không đơn vào ACCEPTED mà không có giá.
  it('KTV chấp nhận thẳng từ PENDING -> ACCEPTED + chốt giá = giá ước tính', async () => {
    const { svc, update } = makeSvc({
      id: 'r1',
      status: 'PENDING',
      estimatedPrice: 5_000_000,
      finalOfferPrice: null,
    });
    await svc.updateStatus('r1', 'ACCEPTED' as never);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'ACCEPTED', finalOfferPrice: 5_000_000 },
      }),
    );
  });

  it('đã báo giá rồi thì chấp nhận KHÔNG ghi đè giá đã chốt', async () => {
    const { svc, update } = makeSvc({
      id: 'r1',
      status: 'OFFERED',
      estimatedPrice: 5_000_000,
      finalOfferPrice: 4_200_000,
    });
    await svc.updateStatus('r1', 'ACCEPTED' as never);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ACCEPTED' } }));
  });

  // Khách không được tự duyệt yêu cầu của mình khi cửa hàng chưa báo giá — bảng luật
  // cho phép PENDING -> ACCEPTED nhưng đó là đường riêng của KTV.
  it('khách không tự chấp nhận được khi yêu cầu còn PENDING', async () => {
    const { svc } = makeSvc({ id: 'r1', status: 'PENDING', userId: 'u1' });
    await expect(svc.respond('r1', customer, true)).rejects.toBeInstanceOf(BadRequestException);
  });
});

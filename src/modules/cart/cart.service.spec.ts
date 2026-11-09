import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CartService } from './cart.service';

/** Test ràng buộc thêm giỏ hàng (PART 7.1) với Prisma mock. */
describe('CartService.addItem', () => {
  /** `existing` = item (cartId, deviceId) đã có sẵn trong CHÍNH giỏ này, null nếu chưa có. */
  const build = (device: unknown, existing: unknown) => {
    const prisma = {
      cart: {
        findUnique: jest.fn().mockResolvedValue({ id: 'c1', userId: 'u1' }),
        create: jest.fn(),
      },
      device: { findFirst: jest.fn().mockResolvedValue(device) },
      cartItem: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const config = { get: jest.fn().mockReturnValue(30000) };
    return { svc: new CartService(prisma as never, config as never), prisma };
  };

  it('device không tồn tại -> NotFound', async () => {
    const { svc } = build(null, null);
    await expect(svc.addItem('u1', 'dev')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('device không IN_STOCK -> Conflict', async () => {
    const { svc } = build({ id: 'dev', status: 'SOLD', deletedAt: null }, null);
    await expect(svc.addItem('u1', 'dev')).rejects.toBeInstanceOf(ConflictException);
  });

  it('device đã có trong CHÍNH giỏ này -> BadRequest', async () => {
    const { svc } = build({ id: 'dev', status: 'IN_STOCK', deletedAt: null }, { id: 'ci1' });
    await expect(svc.addItem('u1', 'dev')).rejects.toBeInstanceOf(BadRequestException);
  });

  // Giỏ KHÔNG giữ chỗ: device đang nằm trong giỏ người khác vẫn thêm được.
  // Giữ chỗ chỉ xảy ra ở tầng Order (Device -> RESERVED), ai checkout trước thì thắng.
  it('device đang trong giỏ người khác -> vẫn thêm được', async () => {
    const { svc, prisma } = build({ id: 'dev', status: 'IN_STOCK', deletedAt: null }, null);
    await expect(svc.addItem('u1', 'dev')).resolves.toBeDefined();
    expect(prisma.cartItem.create).toHaveBeenCalledWith({
      data: { cartId: 'c1', deviceId: 'dev' },
    });
  });
});

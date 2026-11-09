import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({
          where: { userId, deletedAt: null },
          data: { isDefault: false },
        });
      }
      // Địa chỉ đầu tiên tự đặt làm mặc định.
      const count = await tx.address.count({ where: { userId, deletedAt: null } });
      return tx.address.create({
        data: { ...dto, userId, isDefault: dto.isDefault ?? count === 0 },
      });
    });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    await this.ensureOwned(userId, id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({
          where: { userId, deletedAt: null },
          data: { isDefault: false },
        });
      }
      return tx.address.update({ where: { id }, data: dto });
    });
  }

  async setDefault(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.$transaction([
      this.prisma.address.updateMany({
        where: { userId, deletedAt: null },
        data: { isDefault: false },
      }),
      this.prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return { message: 'Đã đặt địa chỉ mặc định' };
  }

  /**
   * Xoá MỀM: địa chỉ biến khỏi sổ địa chỉ nhưng bản ghi vẫn còn.
   *
   * Xoá cứng sẽ kích hoạt `ON DELETE SET NULL` trên `Order.addressId` và thổi bay nơi
   * giao của MỌI đơn cũ trỏ tới địa chỉ đó — lịch sử đơn hàng mất trắng.
   * Nếu địa chỉ vừa xoá đang là mặc định thì chuyển mặc định sang địa chỉ còn lại gần
   * nhất, để khách không rơi vào trạng thái "có địa chỉ nhưng không cái nào mặc định".
   */
  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.$transaction(async (tx) => {
      // Đọc TRƯỚC khi ghi: sau update thì isDefault đã bị set false, không còn biết
      // địa chỉ vừa xoá có phải mặc định hay không.
      const before = await tx.address.findUniqueOrThrow({ where: { id } });
      await tx.address.update({
        where: { id },
        data: { deletedAt: new Date(), isDefault: false },
      });
      if (!before.isDefault) return;
      const next = await tx.address.findFirst({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    });
    return { message: 'Đã xóa địa chỉ' };
  }

  private async ensureOwned(userId: string, id: string) {
    const addr = await this.prisma.address.findFirst({ where: { id, userId, deletedAt: null } });
    if (!addr) throw new NotFoundException('Không tìm thấy địa chỉ');
  }
}

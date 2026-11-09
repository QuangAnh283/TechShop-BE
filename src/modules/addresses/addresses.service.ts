import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      // Địa chỉ đầu tiên tự đặt làm mặc định.
      const count = await tx.address.count({ where: { userId } });
      return tx.address.create({
        data: { ...dto, userId, isDefault: dto.isDefault ?? count === 0 },
      });
    });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    await this.ensureOwned(userId, id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.update({ where: { id }, data: dto });
    });
  }

  async setDefault(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.$transaction([
      this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } }),
      this.prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return { message: 'Đã đặt địa chỉ mặc định' };
  }

  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.address.delete({ where: { id } });
    return { message: 'Đã xóa địa chỉ' };
  }

  private async ensureOwned(userId: string, id: string) {
    const addr = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!addr) throw new NotFoundException('Không tìm thấy địa chỉ');
  }
}

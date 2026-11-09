import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DeviceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { can } from '../../common/authz/can';
import { PERM } from '../../common/authz/permissions';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { CreateWarehouseDto, ExportDeviceDto, ImportDeviceDto } from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Nhập kho: tạo device + ghi giao dịch IMPORT (atomic).
   * `ImportDeviceDto` kế thừa `CreateDeviceDto` nên mang theo cả giá nhập và giá bán —
   * đây là đường thứ hai để sửa giá, phải chặn y như `devices.service.update`.
   */
  async importDevice(dto: ImportDeviceDto, user: AuthUser) {
    if (!can(user, PERM.PRICE_UPDATE)) {
      throw new ForbiddenException('Bạn không được cấp quyền đặt giá khi nhập kho');
    }
    const { note, ...deviceData } = dto;
    const device = await this.prisma.$transaction(async (tx) => {
      const created = await tx.device.create({ data: { ...deviceData, status: 'IN_STOCK' } });
      await tx.inventoryTxn.create({
        data: {
          deviceId: created.id,
          type: 'IMPORT',
          warehouseId: created.warehouseId,
          performedById: user.id,
          note: note ?? 'Nhập kho',
        },
      });
      return created;
    });
    await this.audit.log(user, 'DEVICE_IMPORT', {
      entity: 'Device',
      entityId: device.id,
      meta: {
        serialImei: device.serialImei,
        purchasePrice: device.purchasePrice,
        sellingPrice: device.sellingPrice,
      },
    });
    return device;
  }

  /** Xuất kho: ghi giao dịch EXPORT + cập nhật trạng thái (nếu có). */
  async exportDevice(deviceId: string, dto: ExportDeviceDto, userId: string) {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, deletedAt: null } });
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.device.update({
        where: { id: deviceId },
        data: { status: dto.status ?? device.status },
      });
      await tx.inventoryTxn.create({
        data: {
          deviceId,
          type: 'EXPORT',
          warehouseId: device.warehouseId,
          performedById: userId,
          note: dto.note ?? 'Xuất kho',
        },
      });
      return updated;
    });
  }

  history(deviceId: string) {
    return this.prisma.inventoryTxn.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
      include: { performedBy: { select: { id: true, fullName: true } }, warehouse: true },
    });
  }

  /** Tổng quan tồn kho theo trạng thái. */
  async summary() {
    const grouped = await this.prisma.device.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(Object.values(DeviceStatus).map((s) => [s, 0])) as Record<
      DeviceStatus,
      number
    >;
    for (const g of grouped) byStatus[g.status] = g._count._all;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return { total, byStatus };
  }

  // ---------- Warehouse ----------
  listWarehouses() {
    return this.prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
  }

  createWarehouse(dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({ data: dto });
  }
}

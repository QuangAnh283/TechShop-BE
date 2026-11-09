import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { can } from '../../common/authz/can';
import { PERM } from '../../common/authz/permissions';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import { AuditService } from '../audit/audit.service';
import {
  CreateDeviceDto,
  CreateRepairDto,
  CreateWarrantyDto,
  QueryDeviceDto,
  UpdateDeviceDto,
} from './dto/device.dto';

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(dto: CreateDeviceDto) {
    return this.prisma.device.create({ data: dto });
  }

  async findAll(query: QueryDeviceDto) {
    const where: Prisma.DeviceWhereInput = { deletedAt: null };
    if (query.productId) where.productId = query.productId;
    if (query.status) where.status = query.status;
    if (query.condition) where.condition = query.condition;
    if (query.search) where.serialImei = { contains: query.search, mode: 'insensitive' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.device.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: { product: { select: { id: true, name: true, slug: true } } },
      }),
      this.prisma.device.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, deletedAt: null },
      include: {
        product: { select: { id: true, name: true, slug: true } },
        warranty: true,
        repairs: {
          orderBy: { repairDate: 'desc' },
          include: { technician: { select: { id: true, fullName: true } } },
        },
        warehouse: true,
      },
    });
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị');
    return device;
  }

  /**
   * Sửa thiết bị. Chỉ người có quyền `price.update` mới được đụng tới giá.
   *
   * Trước đây hàm này đổ thẳng `data: dto` nên bất kỳ ai sửa được thiết bị cũng sửa
   * được giá bán. Nay liệt kê field tường minh — guard chỉ chặn được theo endpoint,
   * ràng buộc theo FIELD phải nằm ở đây.
   */
  async update(id: string, dto: UpdateDeviceDto, user: AuthUser) {
    await this.ensureExists(id);
    const { sellingPrice, purchasePrice, ...rest } = dto;
    const touchesPrice = sellingPrice !== undefined || purchasePrice !== undefined;
    if (touchesPrice && !can(user, PERM.PRICE_UPDATE)) {
      throw new ForbiddenException('Bạn không được cấp quyền thay đổi giá');
    }
    const updated = await this.prisma.device.update({
      where: { id },
      data: {
        ...rest,
        ...(sellingPrice !== undefined ? { sellingPrice } : {}),
        ...(purchasePrice !== undefined ? { purchasePrice } : {}),
      },
    });
    if (touchesPrice) {
      await this.audit.log(user, 'PRICE_UPDATE', {
        entity: 'Device',
        entityId: id,
        meta: { sellingPrice, purchasePrice },
      });
    }
    return updated;
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.device.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Đã xóa thiết bị' };
  }

  // ---------- Warranty (PART 5.3) ----------
  async setWarranty(deviceId: string, dto: CreateWarrantyDto) {
    await this.ensureExists(deviceId);
    if (dto.endDate <= dto.startDate) {
      throw new BadRequestException('Ngày kết thúc bảo hành phải sau ngày bắt đầu');
    }
    return this.prisma.warranty.upsert({
      where: { deviceId },
      create: { deviceId, startDate: dto.startDate, endDate: dto.endDate, note: dto.note },
      update: { startDate: dto.startDate, endDate: dto.endDate, note: dto.note },
    });
  }

  // ---------- Repair history (PART 5.4) ----------
  async addRepair(deviceId: string, technicianId: string, dto: CreateRepairDto) {
    await this.ensureExists(deviceId);
    return this.prisma.repairHistory.create({
      data: { deviceId, technicianId, ...dto },
    });
  }

  listRepairs(deviceId: string) {
    return this.prisma.repairHistory.findMany({
      where: { deviceId },
      orderBy: { repairDate: 'desc' },
      include: { technician: { select: { id: true, fullName: true } } },
    });
  }

  private async ensureExists(id: string) {
    const d = await this.prisma.device.findFirst({ where: { id, deletedAt: null } });
    if (!d) throw new NotFoundException('Không tìm thấy thiết bị');
  }
}

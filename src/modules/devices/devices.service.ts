import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CacheService } from '../../cache/cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { can } from '../../common/authz/can';
import { PERM } from '../../common/authz/permissions';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import { assertDeviceTransition } from '../../common/utils/device-status.util';
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
    private readonly cache: CacheService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Xoá cache danh sách sản phẩm. BẮT BUỘC sau mọi thay đổi máy ảnh hưởng tới
   * khả dụng hoặc giá: `priceFrom` và "còn hàng" của một Product được tính từ các
   * `Device` đang `IN_STOCK`, nên đổi trạng thái / sửa giá / thêm / xoá máy đều làm
   * danh sách sai cho tới khi TTL 60s hết. Thiếu lời gọi này thì đánh dấu một máy
   * "Lỗi" rồi mở trang bán hàng vẫn thấy máy đó đang bán.
   */
  private async invalidateProductCache() {
    await this.cache.delByPattern('cache:products:*');
  }

  // `CreateDeviceDto` CỐ Ý không có `status`: máy mới luôn sinh ra ở `IN_STOCK` (default
  // của Prisma). Nếu sau này thêm `status` vào DTO thì phải chặn RESERVED/SOLD ở đây —
  // tạo thẳng một máy "đã bán" mà không có đơn hàng nào đứng sau là dữ liệu rác.
  async create(dto: CreateDeviceDto) {
    const created = await this.prisma.device.create({ data: dto });
    await this.invalidateProductCache();
    return created;
  }

  async findAll(query: QueryDeviceDto) {
    const where: Prisma.DeviceWhereInput = { deletedAt: null };
    if (query.productId) where.productId = query.productId;
    if (query.status) where.status = query.status;
    if (query.condition) where.condition = query.condition;
    // Tìm theo Serial/IMEI HOẶC tên sản phẩm — nhân viên kho thường nhớ tên máy
    // ("iPhone 13") hơn là dãy serial.
    if (query.search) {
      where.OR = [
        { serialImei: { contains: query.search, mode: 'insensitive' } },
        { product: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

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
    const before = await this.ensureExists(id);
    const { sellingPrice, purchasePrice, ...rest } = dto;
    const touchesPrice = sellingPrice !== undefined || purchasePrice !== undefined;
    if (touchesPrice && !can(user, PERM.PRICE_UPDATE)) {
      throw new ForbiddenException('Bạn không được cấp quyền thay đổi giá');
    }
    // Đổi trạng thái phải hợp lệ theo bảng luật. `manual: true` vì bước chuyển do
    // người dùng chỉ định -> chặn luôn RESERVED/SOLD (xem device-status.util.ts).
    if (rest.status !== undefined) {
      assertDeviceTransition(before.status, rest.status, { manual: true });
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
    await this.invalidateProductCache();
    return updated;
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.device.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.invalidateProductCache();
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

  /** Trả về luôn bản ghi để caller dùng được trạng thái hiện tại mà không phải đọc lần hai. */
  private async ensureExists(id: string) {
    const d = await this.prisma.device.findFirst({ where: { id, deletedAt: null } });
    if (!d) throw new NotFoundException('Không tìm thấy thiết bị');
    return d;
  }
}

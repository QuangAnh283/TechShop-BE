import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_ONLY_PERMISSIONS, Permission } from '../../common/authz/permissions';
import { AuditActor, AuditService } from '../audit/audit.service';
import { CreatePermissionGroupDto, UpdatePermissionGroupDto } from './dto/permission-group.dto';

const GROUP_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  permissions: true,
  isSystem: true,
  createdAt: true,
  _count: { select: { members: true } },
} as const;

@Injectable()
export class PermissionGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Danh sách nhóm — trả mảng thuần (ít dòng, không phân trang). */
  findAll() {
    return this.prisma.permissionGroup.findMany({
      where: { deletedAt: null },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      select: GROUP_SELECT,
    });
  }

  async create(dto: CreatePermissionGroupDto, actor?: AuditActor) {
    this.assertNoAdminOnly(dto.permissions);
    const existed = await this.prisma.permissionGroup.findUnique({ where: { code: dto.code } });
    if (existed) throw new ConflictException('Mã nhóm đã tồn tại');

    const created = await this.prisma.permissionGroup.create({
      data: {
        id: `grp_${randomUUID().slice(0, 12)}`,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions,
        isSystem: false,
      },
      select: GROUP_SELECT,
    });
    await this.audit.log(actor, 'GROUP_CREATE', {
      entity: 'PermissionGroup',
      entityId: created.id,
      meta: { code: created.code, name: created.name, permissions: dto.permissions },
    });
    return created;
  }

  async update(id: string, dto: UpdatePermissionGroupDto, actor?: AuditActor) {
    const group = await this.ensureExists(id);
    if (dto.permissions) this.assertNoAdminOnly(dto.permissions);

    const updated = await this.prisma.permissionGroup.update({
      where: { id: group.id },
      data: {
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions,
      },
      select: GROUP_SELECT,
    });
    // Không cần invalidate gì: quyền được đọc thẳng DB mỗi request nên đổi quyền của
    // nhóm có hiệu lực ngay với mọi thành viên ở request kế tiếp.
    await this.audit.log(actor, 'GROUP_UPDATE', {
      entity: 'PermissionGroup',
      entityId: group.id,
      meta: {
        code: group.code,
        before: group.permissions,
        after: dto.permissions ?? group.permissions,
      },
    });
    return updated;
  }

  async remove(id: string, actor?: AuditActor) {
    const group = await this.ensureExists(id);
    if (group.isSystem) {
      throw new ConflictException('Không thể xóa nhóm mặc định của hệ thống');
    }
    const members = await this.prisma.user.count({ where: { permissionGroupId: group.id } });
    if (members > 0) {
      throw new ConflictException(
        `Nhóm còn ${members} nhân sự — hãy chuyển họ sang nhóm khác trước khi xóa`,
      );
    }
    await this.prisma.permissionGroup.delete({ where: { id: group.id } });
    await this.audit.log(actor, 'GROUP_DELETE', {
      entity: 'PermissionGroup',
      entityId: group.id,
      meta: { code: group.code, name: group.name },
    });
    return { message: 'Đã xóa nhóm quyền' };
  }

  /** Gán nhân sự vào nhóm (hoặc gỡ khi `groupId` rỗng). */
  async assignUser(userId: string, groupId: string | null | undefined, actor?: AuditActor) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    if (user.role === 'CUSTOMER') {
      throw new BadRequestException('Chỉ gán nhóm quyền cho tài khoản nhân sự');
    }
    if (groupId) await this.ensureExists(groupId);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { permissionGroupId: groupId ?? null },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        permissionGroup: { select: { id: true, code: true, name: true } },
      },
    });
    await this.audit.log(actor, 'USER_GROUP_CHANGE', {
      entity: 'User',
      entityId: userId,
      meta: { email: updated.email, groupId: groupId ?? null },
    });
    return updated;
  }

  private async ensureExists(id: string) {
    const group = await this.prisma.permissionGroup.findFirst({ where: { id, deletedAt: null } });
    if (!group) throw new NotFoundException('Không tìm thấy nhóm quyền');
    return group;
  }

  /** Chống leo thang đặc quyền — tầng chắn thứ hai sau validate ở DTO. */
  private assertNoAdminOnly(permissions: Permission[]) {
    const forbidden = permissions.filter((p) => ADMIN_ONLY_PERMISSIONS.includes(p));
    if (forbidden.length) {
      throw new BadRequestException(
        `Không được gán quyền chỉ dành cho quản trị viên: ${forbidden.join(', ')}`,
      );
    }
  }
}

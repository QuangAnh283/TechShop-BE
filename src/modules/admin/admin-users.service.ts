import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { USER_SAFE_SELECT } from '../../common/prisma/user-select';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import {
  CreateStaffDto,
  QueryUsersDto,
  UpdateRoleDto,
  UpdateUserStatusDto,
} from './dto/admin-user.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async list(query: QueryUsersDto) {
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (query.role) where.role = query.role;
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { fullName: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SAFE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async createStaff(dto: CreateStaffDto) {
    // Tài khoản khách hàng phải tự đăng ký (để đi qua luồng xác thực email).
    if (dto.role === UserRole.CUSTOMER) {
      throw new BadRequestException('Chỉ tạo được tài khoản nhân sự (Nhân viên/Quản trị viên)');
    }
    const existed = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existed) throw new ConflictException('Email đã tồn tại');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    // Tài khoản do admin tạo: kích hoạt sẵn, không cần xác thực email.
    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
        status: 'ACTIVE',
        emailVerified: true,
      },
      select: USER_SAFE_SELECT,
    });
  }

  async updateRole(id: string, dto: UpdateRoleDto, actor: AuthUser) {
    const target = await this.ensureExists(id);
    if (actor.id === id) {
      throw new BadRequestException('Không thể tự đổi vai trò của chính mình');
    }
    // Hạ quyền quản trị viên cuối cùng = tự khóa cửa hệ thống.
    if (target.role === UserRole.ADMIN && dto.role !== UserRole.ADMIN) {
      await this.ensureNotLastAdmin(id);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
      select: USER_SAFE_SELECT,
    });
    // Token cũ vẫn mang vai trò cũ -> phải đăng xuất mọi thiết bị thì đổi vai trò mới có hiệu lực.
    await this.auth.revokeAllSessions(id);
    await this.audit.log(actor, 'ROLE_CHANGE', {
      entity: 'User',
      entityId: id,
      meta: { email: target.email, from: target.role, to: dto.role },
    });
    return updated;
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto, actor: AuthUser) {
    const target = await this.ensureExists(id);
    if (actor.id === id) {
      throw new BadRequestException('Không thể tự thay đổi trạng thái tài khoản của chính mình');
    }
    if (target.role === UserRole.ADMIN && dto.status !== UserStatus.ACTIVE) {
      await this.ensureNotLastAdmin(id);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: dto.status },
      select: USER_SAFE_SELECT,
    });
    // Khóa tài khoản mà không thu hồi phiên thì người bị khóa vẫn dùng tiếp được.
    await this.auth.revokeAllSessions(id);
    await this.audit.log(actor, 'USER_STATUS_CHANGE', {
      entity: 'User',
      entityId: id,
      meta: { email: target.email, from: target.status, to: dto.status },
    });
    return updated;
  }

  private async ensureExists(id: string) {
    const u = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!u) throw new NotFoundException('Không tìm thấy người dùng');
    return u;
  }

  /** Chặn thao tác khiến hệ thống không còn quản trị viên nào đăng nhập được. */
  private async ensureNotLastAdmin(id: string) {
    const remaining = await this.prisma.user.count({
      where: {
        id: { not: id },
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    });
    if (remaining === 0) {
      throw new ConflictException('Hệ thống phải còn ít nhất một quản trị viên đang hoạt động');
    }
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { User, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { USER_SAFE_SELECT } from '../../common/prisma/user-select';
import { PermissionsService } from '../permissions/permissions.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    phone?: string;
    role?: UserRole;
    status?: UserStatus;
  }) {
    return this.prisma.user.create({ data, select: USER_SAFE_SELECT });
  }

  /**
   * Hồ sơ của chính mình, kèm danh sách quyền hiệu lực để frontend ẩn/hiện nút.
   * ADMIN trả `['*']` — quy ước "mọi quyền", khỏi phải liệt kê toàn bộ danh mục.
   */
  async getProfile(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SAFE_SELECT });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    const access = await this.permissions.getEffective(id);
    const permissions = access?.isAdmin ? ['*'] : (access?.permissions ?? []);
    return { ...user, permissions };
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({ where: { id }, data: dto, select: USER_SAFE_SELECT });
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Mật khẩu hiện tại không đúng');

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { message: 'Đổi mật khẩu thành công' };
  }
}

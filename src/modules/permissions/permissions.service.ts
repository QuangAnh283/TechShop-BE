import { Injectable } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ALL_PERMISSIONS, Permission } from '../../common/authz/permissions';

/** Ảnh chụp quyền hiệu lực của một user tại thời điểm request. */
export interface EffectiveAccess {
  userId: string;
  email: string;
  role: UserRole;
  isAdmin: boolean;
  permissions: Permission[];
}

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Quyền hiệu lực của user — **đọc thẳng DB mỗi request, KHÔNG cache.**
   *
   * Trả `null` nếu tài khoản không còn dùng được (không tồn tại / đã xóa mềm / bị
   * khóa) — người gọi phải coi đó là 401, KHÔNG được coi là "không có quyền nào".
   *
   * Vì sao không nhét quyền vào JWT: token sống 15 phút, nhét quyền vào đó là tái
   * tạo đúng lỗ hổng "token mang quyền cũ" mà hệ thống vừa phải vá, chỉ ở quy mô
   * lớn hơn. Đọc theo userId thì gỡ quyền có hiệu lực ngay ở request kế tiếp.
   *
   * Vì sao KHÔNG cache (trước đây cache Redis `authz:user:<id>` TTL 300s): cache
   * quyền bắt mọi chỗ ghi phải nhớ gọi invalidate đúng khóa — chính là nguồn của lỗ
   * hổng phân quyền đã phải vá. Đây là một truy vấn khóa chính có index (~1-2ms),
   * đổi lấy việc bỏ hẳn một lớp trạng thái phải đồng bộ là đáng.
   */
  async getEffective(userId: string): Promise<EffectiveAccess | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        deletedAt: true,
        permissionGroup: { select: { permissions: true, deletedAt: true } },
      },
    });
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) return null;

    const isAdmin = user.role === UserRole.ADMIN;
    const group = user.permissionGroup;
    // Lọc theo danh mục hiện hành: nhóm cũ không "bật" được mã quyền đã bị gỡ khỏi code.
    const permissions =
      isAdmin || !group || group.deletedAt
        ? []
        : (group.permissions.filter((p): p is Permission =>
            ALL_PERMISSIONS.includes(p as Permission),
          ) ?? []);

    return { userId: user.id, email: user.email, role: user.role, isAdmin, permissions };
  }
}

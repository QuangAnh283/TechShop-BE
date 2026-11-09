import { Injectable } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
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
  /** TTL ngắn: đủ để tiết kiệm truy vấn, đủ ngắn để sai lệch không kéo dài. */
  private static readonly TTL = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Khóa cache quyền. CỐ Ý không dùng tiền tố `cache:` — các service admin gọi
   * `delByPattern('cache:*')` khi ghi dữ liệu, sẽ xóa nhầm quyền của mọi người.
   */
  private key(userId: string): string {
    return `authz:user:${userId}`;
  }

  /**
   * Quyền hiệu lực của user, đọc Redis trước rồi mới tới DB.
   *
   * Trả `null` nếu tài khoản không còn dùng được (không tồn tại / đã xóa mềm / bị
   * khóa) — người gọi phải coi đó là 401, KHÔNG được coi là "không có quyền nào".
   *
   * Vì sao không nhét quyền vào JWT: token sống 15 phút, nhét quyền vào đó là tái
   * tạo đúng lỗ hổng "token mang quyền cũ" mà hệ thống vừa phải vá, chỉ ở quy mô
   * lớn hơn. Đọc theo userId thì gỡ quyền có hiệu lực ngay sau khi invalidate.
   */
  async getEffective(userId: string): Promise<EffectiveAccess | null> {
    // withCache fail-open: Redis hỏng thì rơi về DB — vẫn ĐÚNG, chỉ chậm hơn.
    const snapshot = await this.redis.withCache(this.key(userId), PermissionsService.TTL, () =>
      this.loadFromDb(userId),
    );
    return snapshot;
  }

  private async loadFromDb(userId: string): Promise<EffectiveAccess | null> {
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

  /**
   * Xóa cache quyền + thu hồi mọi phiên của user.
   * Gọi sau MỌI thay đổi: role, status, nhóm quyền, xóa mềm tài khoản.
   */
  async invalidateUser(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
  }

  /** Sửa/xóa nhóm → vô hiệu cache của từng thành viên (chính xác hơn quét `authz:user:*`). */
  async invalidateGroup(groupId: string): Promise<void> {
    const members = await this.prisma.user.findMany({
      where: { permissionGroupId: groupId },
      select: { id: true },
    });
    await Promise.all(members.map((m) => this.invalidateUser(m.id)));
  }
}

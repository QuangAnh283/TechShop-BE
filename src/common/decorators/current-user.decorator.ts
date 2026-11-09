import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Permission } from '../authz/permissions';

/**
 * Payload user gắn vào request sau khi qua JwtAuthGuard.
 *
 * `role` và `permissions` được JwtStrategy nạp TƯƠI từ DB theo userId, không
 * lấy từ nội dung access token — nếu lấy từ token thì gỡ quyền sẽ không có hiệu lực
 * cho tới khi token hết hạn.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  /** Mã quyền được cấp qua nhóm. Rỗng với ADMIN (admin bỏ qua kiểm tra quyền). */
  permissions: Permission[];
}

/** Lấy user hiện tại từ request: @CurrentUser() user: AuthUser */
export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthUser | undefined,
    ctx: ExecutionContext,
  ): AuthUser | AuthUser[keyof AuthUser] => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUser = request.user;
    return data ? user?.[data] : user;
  },
);

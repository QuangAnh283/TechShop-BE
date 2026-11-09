import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../decorators/current-user.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission } from '../authz/permissions';

/**
 * Kiểm tra quyền chi tiết của user hiện tại. Dùng SAU JwtAuthGuard — JwtStrategy đã
 * nạp sẵn `permissions` tươi từ DB vào request.user, nên guard này không phải
 * truy vấn gì thêm.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Route không khai báo quyền -> guard không can thiệp.
    if (!required || required.length === 0) return true;

    const user: AuthUser = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    if (user.role === 'ADMIN') return true;

    const granted = user.permissions ?? [];
    if (required.some((p) => granted.includes(p))) return true;

    // Nêu tên quyền còn thiếu: tiết kiệm rất nhiều thời gian khi dò lỗi phân quyền.
    throw new ForbiddenException(`Bạn chưa được cấp quyền: ${required.join(' hoặc ')}`);
  }
}

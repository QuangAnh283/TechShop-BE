import { SetMetadata } from '@nestjs/common';
import { Permission } from '../authz/permissions';

export const PERMISSIONS_KEY = 'required-permissions';

/**
 * Yêu cầu user có ÍT NHẤT MỘT trong các quyền liệt kê (ngữ nghĩa OR, đồng dạng @Roles).
 * ADMIN luôn được bỏ qua kiểm tra. Dùng kèm `@UseGuards(JwtAuthGuard, PermissionsGuard)`.
 */
export const RequirePermissions = (...perms: Permission[]) => SetMetadata(PERMISSIONS_KEY, perms);

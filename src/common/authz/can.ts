import { AuthUser } from '../decorators/current-user.decorator';
import { Permission } from './permissions';

/**
 * Kiểm tra quyền ở tầng service — dùng cho những ràng buộc guard không làm được,
 * điển hình là chặn theo FIELD (sửa được thiết bị nhưng không sửa được giá).
 */
export function can(user: AuthUser | undefined, perm: Permission): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return (user.permissions ?? []).includes(perm);
}

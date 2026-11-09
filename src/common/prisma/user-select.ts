import { Prisma } from '@prisma/client';

/** Các trường User an toàn để trả ra ngoài (ẩn passwordHash). Dùng chung. */
export const USER_SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  status: true,
  emailVerified: true,
  createdAt: true,
  permissionGroup: { select: { id: true, code: true, name: true } },
} satisfies Prisma.UserSelect;

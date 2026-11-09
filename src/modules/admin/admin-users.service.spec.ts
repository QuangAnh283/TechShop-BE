import { BadRequestException, ConflictException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminUsersService } from './admin-users.service';

/**
 * Rào an toàn khi quản trị tài khoản (thêm 2026-10-20).
 *
 * Trước đây các method này không biết ai đang gọi: admin tự hạ quyền mình được,
 * tự khóa mình được, và hạ quyền được quản trị viên cuối cùng -> khóa cửa hệ thống.
 * Đổi vai trò / khóa tài khoản cũng không thu hồi phiên nên không có hiệu lực thật.
 */
describe('AdminUsersService — rào an toàn', () => {
  const ACTOR = {
    id: 'admin-1',
    email: 'admin@techshop.local',
    role: UserRole.ADMIN,
    permissions: [],
  };

  /** `otherActiveAdmins` = số admin ACTIVE khác ngoài người bị tác động. */
  const build = (target: unknown, otherActiveAdmins = 1) => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(target),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(otherActiveAdmins),
        update: jest.fn().mockResolvedValue({ id: 'u2' }),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
      },
    };
    const auth = { revokeAllSessions: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn() };
    return {
      svc: new AdminUsersService(prisma as never, auth as never, audit as never),
      prisma,
      auth,
    };
  };

  const staff = { id: 'u2', role: UserRole.TECHNICIAN, status: 'ACTIVE', deletedAt: null };
  const admin = { id: 'u2', role: UserRole.ADMIN, status: 'ACTIVE', deletedAt: null };

  it('tự đổi vai trò của chính mình -> BadRequest', async () => {
    const { svc } = build({ ...staff, id: ACTOR.id });
    await expect(
      svc.updateRole(ACTOR.id, { role: UserRole.CUSTOMER }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tự khóa tài khoản của chính mình -> BadRequest', async () => {
    const { svc } = build({ ...staff, id: ACTOR.id });
    await expect(
      svc.updateStatus(ACTOR.id, { status: 'BANNED' as never }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hạ quyền quản trị viên CUỐI CÙNG -> Conflict', async () => {
    const { svc } = build(admin, 0);
    await expect(svc.updateRole('u2', { role: UserRole.TECHNICIAN }, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('khóa quản trị viên CUỐI CÙNG -> Conflict', async () => {
    const { svc } = build(admin, 0);
    await expect(
      svc.updateStatus('u2', { status: 'BANNED' as never }, ACTOR),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('còn admin khác -> hạ quyền được, và THU HỒI phiên của người bị hạ', async () => {
    const { svc, auth } = build(admin, 1);
    await svc.updateRole('u2', { role: UserRole.TECHNICIAN }, ACTOR);
    expect(auth.revokeAllSessions).toHaveBeenCalledWith('u2');
  });

  it('khóa tài khoản nhân viên -> THU HỒI phiên (nếu không, người bị khóa vẫn dùng tiếp)', async () => {
    const { svc, auth } = build(staff);
    await svc.updateStatus('u2', { status: 'BANNED' as never }, ACTOR);
    expect(auth.revokeAllSessions).toHaveBeenCalledWith('u2');
  });

  it('tạo tài khoản role CUSTOMER -> BadRequest (khách phải tự đăng ký)', async () => {
    const { svc } = build(null);
    await expect(
      svc.createStaff({
        email: 'x@y.com',
        password: 'Pass@123',
        fullName: 'X',
        role: UserRole.CUSTOMER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

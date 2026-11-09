import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/** Test Auth (PART 3.1/3.2 + email verification) với mock. */
describe('AuthService', () => {
  const build = (
    overrides: {
      findByEmail?: jest.Mock;
      create?: jest.Mock;
    } = {},
  ) => {
    const users = {
      findByEmail: overrides.findByEmail ?? jest.fn().mockResolvedValue(null),
      create:
        overrides.create ??
        jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com', fullName: 'A' }),
    };
    const prisma = { emailVerificationToken: { create: jest.fn().mockResolvedValue({}) } };
    // Session refresh-token nằm trong Redis (từ 2026-10-09) — mock các helper service dùng tới.
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delByPattern: jest.fn().mockResolvedValue(undefined),
    };
    const jwt = { signAsync: jest.fn(), verifyAsync: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('http://localhost:3001') };
    const mail = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };
    const permissions = {
      getEffective: jest.fn().mockResolvedValue(null),
      invalidateUser: jest.fn(),
    };
    const svc = new AuthService(
      prisma as never,
      redis as never,
      users as never,
      jwt as never,
      config as never,
      mail as never,
      permissions as never,
    );
    return { svc, users, mail };
  };

  it('register trùng email -> Conflict', async () => {
    const { svc } = build({ findByEmail: jest.fn().mockResolvedValue({ id: 'x' }) });
    await expect(
      svc.register({ email: 'a@b.com', password: 'Pass@123', fullName: 'A' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('register thành công -> tạo user INACTIVE + gửi email', async () => {
    const { svc, users, mail } = build();
    const r = await svc.register({ email: 'a@b.com', password: 'Pass@123', fullName: 'A' });
    expect(users.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'INACTIVE' }));
    expect(mail.sendVerificationEmail).toHaveBeenCalled();
    expect(r.message).toContain('Đăng ký');
  });

  it('login email không tồn tại -> Unauthorized', async () => {
    const { svc } = build({ findByEmail: jest.fn().mockResolvedValue(null) });
    await expect(svc.login({ email: 'x@y.com', password: 'p' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('login khi chưa xác thực email -> Unauthorized (báo chưa xác thực)', async () => {
    const { svc } = build({
      findByEmail: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        status: 'INACTIVE',
        emailVerified: false,
        passwordHash: 'x',
      }),
    });
    await expect(svc.login({ email: 'a@b.com', password: 'p' })).rejects.toThrow(/xác thực/);
  });
});

/**
 * Hồi quy lỗ hổng "token mang quyền cũ" (vá 2026-10-20).
 *
 * Trước đây `refresh()` cấp token mới bằng `payload.role` của token CŨ và không kiểm
 * `status`, nên người bị khóa hoặc bị hạ quyền giữ quyền cũ vô thời hạn — mỗi lần
 * refresh lại gia hạn thêm một vòng đời refresh-token.
 */
describe('AuthService.refresh', () => {
  const PAYLOAD = { sub: 'u1', email: 'a@b.com', role: 'ADMIN', jti: 'j1' };

  const build = (dbUser: unknown) => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(dbUser) } };
    const redis = {
      raw: { exists: jest.fn().mockResolvedValue(1) },
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delByPattern: jest.fn().mockResolvedValue(undefined),
    };
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue(PAYLOAD),
      signAsync: jest.fn().mockResolvedValue('token'),
    };
    const config = { get: jest.fn().mockReturnValue('7d') };
    const permissions = { invalidateUser: jest.fn().mockResolvedValue(undefined) };
    const svc = new AuthService(
      prisma as never,
      redis as never,
      {} as never,
      jwt as never,
      config as never,
      {} as never,
      permissions as never,
    );
    return { svc, prisma, redis, jwt };
  };

  const activeUser = {
    id: 'u1',
    email: 'a@b.com',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    deletedAt: null,
  };

  it('lấy role TƯƠI từ DB, không dùng role trong token cũ', async () => {
    // Token cũ nói ADMIN, DB nói CUSTOMER (vừa bị hạ quyền) -> phải ký theo DB.
    const { svc, jwt } = build(activeUser);
    await svc.refresh('rt');
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'CUSTOMER' }),
      expect.anything(),
    );
    expect(jwt.signAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ADMIN' }),
      expect.anything(),
    );
  });

  it('tài khoản bị khóa -> 401 và thu hồi sạch mọi phiên', async () => {
    const { svc, redis } = build({ ...activeUser, status: 'BANNED' });
    await expect(svc.refresh('rt')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.delByPattern).toHaveBeenCalledWith('refresh:u1:*');
  });

  it('tài khoản đã xóa mềm -> 401', async () => {
    const { svc } = build({ ...activeUser, deletedAt: new Date() });
    await expect(svc.refresh('rt')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('user không còn tồn tại -> 401', async () => {
    const { svc } = build(null);
    await expect(svc.refresh('rt')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

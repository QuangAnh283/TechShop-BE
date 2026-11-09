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
    // Session refresh-token nằm ở bảng RefreshToken trong PostgreSQL (từ 2026-11-09,
    // trước đó ở Redis — Redis đã được gỡ khỏi dự án).
    const prisma = {
      emailVerificationToken: { create: jest.fn().mockResolvedValue({}) },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const jwt = { signAsync: jest.fn(), verifyAsync: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('http://localhost:3001') };
    const mail = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };
    const permissions = { getEffective: jest.fn().mockResolvedValue(null) };
    const svc = new AuthService(
      prisma as never,
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

  /** Bản ghi whitelist còn hiệu lực trong bảng RefreshToken. */
  const validStored = {
    id: 'rt1',
    userId: 'u1',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  const build = (dbUser: unknown, stored: unknown = validStored) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(dbUser) },
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue(stored),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue(PAYLOAD),
      signAsync: jest.fn().mockResolvedValue('token'),
    };
    const config = { get: jest.fn().mockReturnValue('7d') };
    const permissions = { getEffective: jest.fn().mockResolvedValue(null) };
    const svc = new AuthService(
      prisma as never,
      {} as never,
      jwt as never,
      config as never,
      {} as never,
      permissions as never,
    );
    return { svc, prisma, jwt };
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
    const { svc, prisma } = build({ ...activeUser, status: 'BANNED' });
    await expect(svc.refresh('rt')).rejects.toBeInstanceOf(UnauthorizedException);
    // revokeAllSessions: thu hồi mọi refresh-token chưa thu hồi của user đó.
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
    );
  });

  it('token không có trong whitelist -> 401 (không đọc tới user)', async () => {
    const { svc, prisma } = build(activeUser, null);
    await expect(svc.refresh('rt')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('token đã bị thu hồi -> 401 (chống tái dùng token đã xoay)', async () => {
    const { svc } = build(activeUser, { ...validStored, revokedAt: new Date() });
    await expect(svc.refresh('rt')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token đã hết hạn trong bảng -> 401', async () => {
    const { svc } = build(activeUser, { ...validStored, expiresAt: new Date(Date.now() - 1000) });
    await expect(svc.refresh('rt')).rejects.toBeInstanceOf(UnauthorizedException);
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

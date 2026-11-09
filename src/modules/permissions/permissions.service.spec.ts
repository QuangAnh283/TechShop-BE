import { PERM } from '../../common/authz/permissions';
import { PermissionsService } from './permissions.service';

/** Giải quyền hiệu lực từ nhóm quyền trong DB. */
describe('PermissionsService.getEffective', () => {
  const build = (dbUser: unknown) => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(dbUser) } };
    // withCache thật sẽ gọi fn khi cache miss — mock đúng hành vi đó.
    const redis = {
      withCache: jest.fn(<T>(_k: string, _t: number, fn: () => Promise<T>) => fn()),
      del: jest.fn().mockResolvedValue(undefined),
    };
    return new PermissionsService(prisma as never, redis as never);
  };

  const base = { id: 'u1', email: 'a@b.com', status: 'ACTIVE', deletedAt: null };

  it('ADMIN -> isAdmin, không cần liệt kê quyền', async () => {
    const svc = build({ ...base, role: 'ADMIN', permissionGroup: null });
    const access = await svc.getEffective('u1');
    expect(access?.isAdmin).toBe(true);
  });

  it('nhân viên có nhóm -> nhận đúng quyền của nhóm', async () => {
    const svc = build({
      ...base,
      role: 'TECHNICIAN',
      permissionGroup: {
        permissions: [PERM.TRADEIN_INSPECT, PERM.INVENTORY_READ],
        deletedAt: null,
      },
    });
    const access = await svc.getEffective('u1');
    expect(access?.isAdmin).toBe(false);
    expect(access?.permissions).toEqual([PERM.TRADEIN_INSPECT, PERM.INVENTORY_READ]);
  });

  it('nhân viên chưa có nhóm -> không có quyền nào', async () => {
    const svc = build({ ...base, role: 'TECHNICIAN', permissionGroup: null });
    expect((await svc.getEffective('u1'))?.permissions).toEqual([]);
  });

  it('bỏ qua mã quyền lạ còn sót trong nhóm cũ', async () => {
    const svc = build({
      ...base,
      role: 'TECHNICIAN',
      permissionGroup: { permissions: [PERM.MEDIA_UPLOAD, 'quyen.da.bi.go'], deletedAt: null },
    });
    expect((await svc.getEffective('u1'))?.permissions).toEqual([PERM.MEDIA_UPLOAD]);
  });

  // Trả null = "tài khoản không dùng được" -> người gọi phải coi là 401,
  // KHÔNG được hiểu nhầm thành "không có quyền nào".
  it('tài khoản bị khóa -> null', async () => {
    const svc = build({ ...base, status: 'BANNED', role: 'ADMIN', permissionGroup: null });
    expect(await svc.getEffective('u1')).toBeNull();
  });

  it('tài khoản đã xóa mềm -> null', async () => {
    const svc = build({ ...base, deletedAt: new Date(), role: 'ADMIN', permissionGroup: null });
    expect(await svc.getEffective('u1')).toBeNull();
  });

  it('nhóm đã bị xóa mềm -> không còn quyền nào', async () => {
    const svc = build({
      ...base,
      role: 'TECHNICIAN',
      permissionGroup: { permissions: [PERM.MEDIA_UPLOAD], deletedAt: new Date() },
    });
    expect((await svc.getEffective('u1'))?.permissions).toEqual([]);
  });
});

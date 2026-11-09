import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PRESET_GROUPS } from '../../common/authz/permissions';

/**
 * Tạo sẵn các nhóm quyền preset khi khởi động, và gán nhóm cho nhân viên cũ.
 *
 * Vì sao không INSERT trong file migration: `npm run db:dump` xuất dữ liệu ra
 * `prisma/seed.sql`, nên dòng INSERT trong migration sẽ xuất hiện lại trong seed và
 * lần `migrate reset && db:seed` sau sẽ vỡ vì trùng khóa chính. Upsert lúc khởi động
 * thì chạy bao nhiêu lần cũng an toàn.
 */
@Injectable()
export class PermissionsBootstrap implements OnModuleInit {
  private readonly logger = new Logger('Permissions');

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedPresetGroups();
      await this.backfillExistingStaff();
    } catch (e) {
      // Không chặn app khởi động (vd DB chưa migrate lúc chạy lệnh CLI).
      this.logger.warn(`Bỏ qua khởi tạo nhóm quyền: ${(e as Error).message}`);
    }
  }

  private async seedPresetGroups(): Promise<void> {
    for (const preset of PRESET_GROUPS) {
      await this.prisma.permissionGroup.upsert({
        where: { code: preset.code },
        create: {
          id: preset.id,
          code: preset.code,
          name: preset.name,
          description: preset.description,
          permissions: preset.permissions,
          isSystem: true,
        },
        // KHÔNG đè: admin có thể đã chỉnh sửa nhóm preset trên giao diện.
        update: {},
      });
    }
  }

  /**
   * Nhân viên đã có trong DB trước khi có nhóm quyền → gán nhóm "Kỹ thuật viên thu cũ"
   * để không ai mất quyền lúc triển khai. Idempotent nhờ điều kiện "chưa thuộc nhóm nào".
   */
  private async backfillExistingStaff(): Promise<void> {
    const technicianGroup = PRESET_GROUPS.find((g) => g.code === 'TECHNICIAN');
    if (!technicianGroup) return;

    const { count } = await this.prisma.user.updateMany({
      where: { role: UserRole.TECHNICIAN, permissionGroupId: null, deletedAt: null },
      data: { permissionGroupId: technicianGroup.id },
    });
    if (count > 0) {
      this.logger.log(`Đã gán nhóm "${technicianGroup.name}" cho ${count} nhân viên chưa có nhóm.`);
    }
  }
}

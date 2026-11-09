import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { QueryAuditDto } from './dto/query-audit.dto';

/** Người thực hiện hành động (lấy từ @CurrentUser). */
export interface AuditActor {
  id?: string;
  email?: string;
}

/**
 * Nhật ký quản trị — ghi lại các thao tác nhạy cảm.
 *
 * FAIL-OPEN: lỗi ghi audit KHÔNG được làm hỏng request nghiệp vụ.
 * `actorEmail` lưu denormalized để log bất biến (không vỡ khi user bị xóa sau này).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async log(
    actor: AuditActor | null | undefined,
    action: string,
    opts: { entity?: string; entityId?: string; meta?: Prisma.InputJsonValue } = {},
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: actor?.id,
          actorEmail: actor?.email,
          action,
          entity: opts.entity,
          entityId: opts.entityId,
          meta: opts.meta,
        },
      });
    } catch (e) {
      this.logger.warn(`Ghi audit thất bại (${action}): ${(e as Error).message}`);
    }
  }

  async list(query: QueryAuditDto) {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.entity) where.entity = query.entity;
    if (query.actor) where.actorEmail = { contains: query.actor, mode: 'insensitive' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  /** Danh mục mã hành động để FE render bộ lọc. */
  listActions() {
    return AUDIT_ACTIONS;
  }
}

/** Mã hành động được ghi (đồng bộ với các chỗ gọi audit.log). */
export const AUDIT_ACTIONS = [
  'ORDER_STATUS_CHANGE',
  'ORDER_CANCEL',
  'ORDER_REFUND',
  'PRICE_UPDATE',
  'PRODUCT_UPDATE',
  'DEVICE_IMPORT',
  'ROLE_CHANGE',
  'USER_STATUS_CHANGE',
  'USER_GROUP_CHANGE',
  'GROUP_CREATE',
  'GROUP_UPDATE',
  'GROUP_DELETE',
  'TRADEIN_INSPECT',
  'TRADEIN_STATUS_CHANGE',
] as const;

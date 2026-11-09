import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TradeInStatus, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { can } from '../../common/authz/can';
import { PERM } from '../../common/authz/permissions';
import { paginate, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { MEDIA_SELECT, toUrl } from '../../common/utils/media.util';
import { AuditActor, AuditService } from '../audit/audit.service';
import {
  CreateQuestionDto,
  CreateRequestDto,
  EstimateDto,
  InspectDto,
  UpsertRuleDto,
} from './dto/trade-in.dto';

/** Thông tin admin nhập tay khi hoàn tất thu cũ và đưa máy vào kho. */
export interface ImportDeviceOptions {
  serialImei?: string;
  purchasePrice?: number;
  sellingPrice?: number;
}

/**
 * NGUỒN DUY NHẤT của luật trạng thái thu cũ (nghiệp vụ chốt 2026-11-09).
 * Mọi thao tác đổi trạng thái (inspect / respond / updateStatus) PHẢI đi qua bảng này
 * — không guard inline tự chế nữa.
 *
 * Khách KHÔNG gửi máy đi trước. KTV xem yêu cầu trên hệ thống rồi quyết định:
 *
 *   PENDING ─KTV báo giá lại──→ OFFERED ─khách đồng ý──→ ACCEPTED ─giao dịch xong──→ COMPLETED
 *   PENDING ─KTV đồng ý luôn giá ước tính──────────────→ ACCEPTED
 *   OFFERED → OFFERED            (KTV sửa báo giá khi khách chưa phản hồi)
 *   OFFERED → CUSTOMER_DECLINED  (khách chê giá ⇒ yêu cầu không được thực hiện)
 *   PENDING/OFFERED → SHOP_REJECTED (cửa hàng từ chối thu)
 *
 * Vào ACCEPTED là lúc báo khách mang máy tới cơ sở; COMPLETED là khi giao dịch trực tiếp
 * xong và máy được nhập kho. Không có trạng thái "đã nhận máy" vì cửa hàng không bao giờ
 * giữ máy của khách ở giai đoạn chờ.
 */
const TI_TRANSITIONS: Record<TradeInStatus, TradeInStatus[]> = {
  PENDING: ['OFFERED', 'ACCEPTED', 'SHOP_REJECTED'],
  OFFERED: ['OFFERED', 'ACCEPTED', 'CUSTOMER_DECLINED', 'SHOP_REJECTED'],
  ACCEPTED: ['COMPLETED'],
  COMPLETED: [],
  SHOP_REJECTED: [],
  CUSTOMER_DECLINED: [],
};

@Injectable()
export class TradeInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ================= Questions (PART 10.1) =================
  listQuestions(categoryId?: string) {
    return this.prisma.tradeInQuestion.findMany({
      where: {
        isActive: true,
        OR: [{ categoryId: null }, ...(categoryId ? [{ categoryId }] : [])],
      },
      orderBy: { sortOrder: 'asc' },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /** Sản phẩm có rule thu cũ đang bật (kèm giá gốc thu mua) để khách chọn máy mình đang có. */
  async listTradeInProducts(categorySlug?: string, q?: string) {
    const rules = await this.prisma.tradeInRule.findMany({
      where: {
        isActive: true,
        product: {
          deletedAt: null,
          isActive: true,
          ...(categorySlug ? { category: { slug: categorySlug } } : {}),
          ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
        },
      },
      include: {
        product: {
          include: {
            brand: { select: { id: true, name: true, slug: true } },
            category: { select: { id: true, name: true, slug: true } },
            thumbnailMedia: MEDIA_SELECT,
          },
        },
      },
      orderBy: { product: { name: 'asc' } },
      take: 100,
    });
    return rules.map((r) => ({
      ...r.product,
      thumbnailUrl: toUrl(r.product.thumbnailMedia),
      tradeInBasePrice: r.basePrice,
    }));
  }

  createQuestion(dto: CreateQuestionDto) {
    return this.prisma.tradeInQuestion.create({
      data: {
        text: dto.text,
        categoryId: dto.categoryId,
        sortOrder: dto.sortOrder ?? 0,
        options: {
          create: dto.options.map((o, i) => ({
            label: o.label,
            priceAdjustment: o.priceAdjustment,
            sortOrder: o.sortOrder ?? i,
          })),
        },
      },
      include: { options: true },
    });
  }

  async deleteQuestion(id: string) {
    await this.prisma.tradeInQuestion.delete({ where: { id } });
    return { message: 'Đã xóa câu hỏi' };
  }

  // ================= Rules (PART 10.2) =================
  upsertRule(dto: UpsertRuleDto) {
    return this.prisma.tradeInRule.upsert({
      where: { productId: dto.productId },
      create: {
        productId: dto.productId,
        basePrice: dto.basePrice,
        isActive: dto.isActive ?? true,
      },
      update: { basePrice: dto.basePrice, isActive: dto.isActive },
    });
  }

  // ================= Pricing engine (PART 10.3) =================
  /** Tính giá dự kiến: basePrice + tổng điều chỉnh của các option đã chọn. */
  async estimate(dto: EstimateDto) {
    const rule = await this.prisma.tradeInRule.findUnique({
      where: { productId: dto.productId },
      include: { product: { select: { id: true, name: true } } },
    });
    if (!rule || !rule.isActive) {
      throw new BadRequestException('Sản phẩm này hiện không hỗ trợ thu cũ');
    }

    const options = dto.optionIds.length
      ? await this.prisma.tradeInOption.findMany({
          where: { id: { in: dto.optionIds } },
          include: { question: { select: { id: true, text: true } } },
        })
      : [];
    if (options.length !== dto.optionIds.length) {
      throw new BadRequestException('Có lựa chọn không hợp lệ');
    }

    const breakdown = options.map((o) => ({
      questionId: o.questionId,
      question: o.question.text,
      optionId: o.id,
      option: o.label,
      adjustment: o.priceAdjustment,
    }));
    const totalAdjustment = breakdown.reduce((s, b) => s + b.adjustment, 0);
    const estimatedPrice = Math.max(0, rule.basePrice + totalAdjustment);

    return {
      product: rule.product,
      basePrice: rule.basePrice,
      totalAdjustment,
      estimatedPrice,
      breakdown,
    };
  }

  // ================= Requests (PART 10.4) =================
  async createRequest(userId: string, dto: CreateRequestDto) {
    const est = await this.estimate(dto);
    const optionLink = await this.prisma.tradeInOption.findMany({
      where: { id: { in: dto.optionIds } },
      select: { id: true, questionId: true },
    });

    // C1: bắt buộc trả lời ĐỦ các câu hỏi áp dụng, mỗi câu đúng 1 đáp án.
    await this.assertFullAnswers(dto.productId, optionLink);

    const created = await this.prisma.tradeInRequest.create({
      data: {
        userId,
        productId: dto.productId,
        estimatedPrice: est.estimatedPrice,
        status: TradeInStatus.PENDING,
        imei: dto.imei,
        deviceDescription: dto.deviceDescription,
        note: dto.note,
        answers: {
          create: optionLink.map((o) => ({ questionId: o.questionId, optionId: o.id })),
        },
      },
      include: this.requestInclude(),
    });
    return this.mapRequest(created);
  }

  /** Kiểm tra câu trả lời phủ hết câu hỏi áp dụng cho danh mục sản phẩm, mỗi câu 1 đáp án. */
  private async assertFullAnswers(
    productId: string,
    optionLink: { id: string; questionId: string }[],
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { categoryId: true },
    });
    const questions = await this.prisma.tradeInQuestion.findMany({
      where: {
        isActive: true,
        OR: [
          { categoryId: null },
          ...(product?.categoryId ? [{ categoryId: product.categoryId }] : []),
        ],
      },
      select: { id: true },
    });
    const required = new Set(questions.map((q) => q.id));
    const answeredByQuestion = new Map<string, number>();
    for (const o of optionLink) {
      answeredByQuestion.set(o.questionId, (answeredByQuestion.get(o.questionId) ?? 0) + 1);
    }
    for (const qId of required) {
      const n = answeredByQuestion.get(qId) ?? 0;
      if (n !== 1) {
        throw new BadRequestException(
          'Vui lòng trả lời đủ tất cả câu hỏi, mỗi câu chọn một đáp án',
        );
      }
    }
    if (answeredByQuestion.size !== required.size) {
      throw new BadRequestException('Có đáp án không thuộc bộ câu hỏi áp dụng');
    }
  }

  async findMine(userId: string, query: PaginationQueryDto) {
    return this.paginateRequests({ userId }, query);
  }

  async findAll(query: PaginationQueryDto & { status?: TradeInStatus }) {
    const where: Prisma.TradeInRequestWhereInput = {};
    if (query.status) where.status = query.status;
    return this.paginateRequests(where, query);
  }

  async findOne(id: string, user: AuthUser) {
    const req = await this.prisma.tradeInRequest.findUnique({
      where: { id },
      include: this.requestInclude(),
    });
    if (!req) throw new NotFoundException('Không tìm thấy yêu cầu thu cũ');
    if (user.role === UserRole.CUSTOMER && req.userId !== user.id) {
      throw new ForbiddenException('Không thể xem yêu cầu của người khác');
    }
    return this.mapRequest(req);
  }

  // ================= Technician inspection (PART 10.5) =================
  /**
   * Nhận xử lý: chỉ gán kỹ thuật viên phụ trách, KHÔNG đổi trạng thái.
   * (Trước đây bước này đẩy sang RECEIVED = "đã nhận máy" — sai, vì khách chưa gửi máy đi:
   * máy chỉ được mang tới cơ sở sau khi hai bên chốt giá.)
   */
  async assign(id: string, technicianId: string) {
    await this.getRequest(id);
    const updated = await this.prisma.tradeInRequest.update({
      where: { id },
      data: { assignedTechnicianId: technicianId },
      include: this.requestInclude(),
    });
    return this.mapRequest(updated);
  }

  /**
   * Kiểm định + chốt giá (gộp 1 bước) → OFFERED.
   * Hợp lệ khi đang PENDING (báo giá lần đầu) hoặc OFFERED (sửa báo giá khi khách chưa
   * phản hồi) — cả hai đều nằm trong `TI_TRANSITIONS[...] → OFFERED`.
   */
  async inspect(id: string, technicianId: string, dto: InspectDto, actor?: AuditActor) {
    const req = await this.getRequest(id);
    this.assertTransition(req.status, TradeInStatus.OFFERED);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.tradeInInspection.upsert({
        where: { requestId: id },
        create: {
          requestId: id,
          technicianId,
          actualCondition: dto.actualCondition,
          adjustedPrice: dto.adjustedPrice,
          note: dto.note,
          evidences: dto.evidenceMediaIds?.length
            ? { create: dto.evidenceMediaIds.map((mediaId) => ({ mediaId })) }
            : undefined,
        },
        update: {
          technicianId,
          actualCondition: dto.actualCondition,
          adjustedPrice: dto.adjustedPrice,
          note: dto.note,
        },
      });
      // Chốt offer: cập nhật giá cuối + chuyển OFFERED.
      return tx.tradeInRequest.update({
        where: { id },
        data: {
          finalOfferPrice: dto.adjustedPrice,
          status: TradeInStatus.OFFERED,
          assignedTechnicianId: req.assignedTechnicianId ?? technicianId,
        },
        include: this.requestInclude(),
      });
    });
    await this.audit.log(actor, 'TRADEIN_INSPECT', {
      entity: 'TradeInRequest',
      entityId: id,
      meta: {
        from: req.status,
        adjustedPrice: dto.adjustedPrice,
        actualCondition: dto.actualCondition,
      },
    });
    return this.mapRequest(result);
  }

  // ================= User accept/reject (PART 10.6) =================
  /** Khách phản hồi báo giá: đồng ý → ACCEPTED, từ chối → CUSTOMER_DECLINED (chỉ khi OFFERED). */
  async respond(id: string, user: AuthUser, accept: boolean) {
    const req = await this.getRequest(id);
    if (req.userId !== user.id) throw new ForbiddenException('Không phải yêu cầu của bạn');
    // Bắt buộc đang OFFERED. Bảng luật cho phép cả PENDING → ACCEPTED, nhưng đó là đường
    // của KTV (đồng ý luôn giá ước tính); không chặn ở đây thì khách tự duyệt yêu cầu
    // của chính mình khi cửa hàng còn chưa xem tới.
    if (req.status !== TradeInStatus.OFFERED) {
      throw new BadRequestException('Yêu cầu chưa có báo giá để phản hồi');
    }
    const next = accept ? TradeInStatus.ACCEPTED : TradeInStatus.CUSTOMER_DECLINED;
    this.assertTransition(req.status, next);
    const updated = await this.prisma.tradeInRequest.update({
      where: { id },
      data: { status: next },
      include: this.requestInclude(),
    });
    return this.mapRequest(updated);
  }

  /** Admin đổi trạng thái theo luồng hợp lệ (vd ACCEPTED -> COMPLETED). */
  async updateStatus(
    id: string,
    next: TradeInStatus,
    importOpts: ImportDeviceOptions = {},
    user?: AuthUser,
  ) {
    const req = await this.getRequest(id);
    this.assertTransition(req.status, next);
    // Nhập kho vẫn chạy được khi không có quyền giá — chỉ là không tự đặt giá,
    // hệ thống dùng giá đã chốt + công thức mặc định.
    const setsPrice =
      importOpts.purchasePrice !== undefined || importOpts.sellingPrice !== undefined;
    if (setsPrice && !can(user, PERM.PRICE_UPDATE)) {
      throw new ForbiddenException('Bạn không được cấp quyền đặt giá khi nhập kho');
    }
    // C3: hoàn tất thu cũ -> nhập máy vào kho làm Device để bán lại.
    if (next === TradeInStatus.COMPLETED) {
      const res = await this.completeAndImportDevice(id, importOpts);
      await this.audit.log(user, 'TRADEIN_STATUS_CHANGE', {
        entity: 'TradeInRequest',
        entityId: id,
        meta: { from: req.status, to: next },
      });
      return res;
    }
    const updated = await this.prisma.tradeInRequest.update({
      where: { id },
      data: {
        status: next,
        // KTV chấp nhận thẳng từ PENDING (không sửa báo giá) ⇒ giá chốt chính là giá ước
        // tính khách đã thấy lúc gửi yêu cầu. Không ghi lại thì đơn vào ACCEPTED mà
        // không có giá nào được chốt.
        ...(next === TradeInStatus.ACCEPTED && req.finalOfferPrice == null
          ? { finalOfferPrice: req.estimatedPrice }
          : {}),
      },
      include: this.requestInclude(),
    });
    await this.audit.log(user, 'TRADEIN_STATUS_CHANGE', {
      entity: 'TradeInRequest',
      entityId: id,
      meta: { from: req.status, to: next },
    });
    return this.mapRequest(updated);
  }

  /**
   * Chuyển COMPLETED + tạo Device tồn kho từ máy thu được (atomic).
   *
   * Khóa dòng TradeInRequest ngay đầu transaction: bấm "Hoàn tất" hai lần song song
   * (hoặc double-click) từng tạo được 2 Device + 2 InventoryTxn cho cùng một máy, vì
   * serial tự sinh là ngẫu nhiên nên không có gì chặn trùng.
   */
  private async completeAndImportDevice(id: string, opts: ImportDeviceOptions = {}) {
    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; status: TradeInStatus }[]>(
        Prisma.sql`SELECT id, status FROM "TradeInRequest" WHERE id = ${id} FOR UPDATE`,
      );
      if (!locked[0]) throw new NotFoundException('Không tìm thấy yêu cầu thu cũ');

      // Đã hoàn tất từ trước (lần bấm thứ hai) -> trả nguyên trạng, không nhập kho lần nữa.
      if (locked[0].status === TradeInStatus.COMPLETED) {
        return tx.tradeInRequest.findUniqueOrThrow({
          where: { id },
          include: this.requestInclude(),
        });
      }
      if (locked[0].status !== TradeInStatus.ACCEPTED) {
        throw new BadRequestException(`Không thể hoàn tất ở trạng thái ${locked[0].status}`);
      }

      const req = await tx.tradeInRequest.findUnique({
        where: { id },
        include: { inspection: true },
      });
      if (!req) throw new NotFoundException('Không tìm thấy yêu cầu thu cũ');

      // Admin nhập tay được IMEI/giá lúc nhập kho; không nhập thì lấy mặc định như cũ.
      const purchasePrice = opts.purchasePrice ?? req.finalOfferPrice ?? req.estimatedPrice;
      const sellingPrice = opts.sellingPrice ?? Math.round((purchasePrice * 1.2) / 10000) * 10000; // +20%
      const condition = req.inspection?.actualCondition ?? 'GOOD';
      const serial =
        opts.serialImei?.trim() ||
        req.imei?.trim() ||
        `TRADEIN-${randomUUID().slice(0, 12).toUpperCase()}`;

      const existed = await tx.device.findUnique({ where: { serialImei: serial } });
      if (existed) {
        throw new ConflictException(
          `Đã có thiết bị mang IMEI/Serial "${serial}" trong kho — kiểm tra lại hoặc nhập IMEI khác.`,
        );
      }

      const warehouse = await tx.warehouse.findFirst();
      const device = await tx.device.create({
        data: {
          productId: req.productId,
          serialImei: serial,
          condition,
          purchasePrice,
          sellingPrice,
          status: 'IN_STOCK',
          warehouseId: warehouse?.id,
        },
      });
      await tx.inventoryTxn.create({
        data: {
          deviceId: device.id,
          type: 'IMPORT',
          warehouseId: warehouse?.id,
          note: `Nhập từ thu cũ (trade-in ${id})`,
        },
      });

      return tx.tradeInRequest.update({
        where: { id },
        data: { status: TradeInStatus.COMPLETED },
        include: this.requestInclude(),
      });
    });
    return this.mapRequest(result);
  }

  // ---------- Helpers ----------
  private async getRequest(id: string) {
    const req = await this.prisma.tradeInRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Không tìm thấy yêu cầu thu cũ');
    return req;
  }

  /** Chốt chặn chuyển trạng thái qua đúng MỘT bảng luật `TI_TRANSITIONS`. */
  private assertTransition(from: TradeInStatus, to: TradeInStatus) {
    if (!TI_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(`Không thể chuyển ${from} -> ${to}`);
    }
  }

  private requestInclude() {
    return {
      product: {
        select: { id: true, name: true, slug: true, thumbnailMedia: MEDIA_SELECT },
      },
      user: { select: { id: true, email: true, fullName: true } },
      answers: { include: { question: true, option: true } },
      inspection: { include: { evidences: { include: { media: MEDIA_SELECT } } } },
      assignedTechnician: { select: { id: true, fullName: true } },
    } satisfies Prisma.TradeInRequestInclude;
  }

  /** Map media → chuỗi URL cho 1 request (product.thumbnailUrl + evidences[].imageUrl). */
  private mapRequest<T extends Record<string, any>>(req: T): T {
    if (!req) return req;
    const product = req.product
      ? { ...req.product, thumbnailUrl: toUrl(req.product.thumbnailMedia) }
      : req.product;
    const inspection = req.inspection
      ? {
          ...req.inspection,
          evidences: req.inspection.evidences?.map((e: any) => ({
            ...e,
            imageUrl: toUrl(e.media),
          })),
        }
      : req.inspection;
    return { ...req, product, inspection };
  }

  private async paginateRequests(
    where: Prisma.TradeInRequestWhereInput,
    query: PaginationQueryDto,
  ) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tradeInRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: this.requestInclude(),
      }),
      this.prisma.tradeInRequest.count({ where }),
    ]);
    return paginate(
      items.map((i) => this.mapRequest(i)),
      total,
      query.page,
      query.limit,
    );
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { PermissionsService } from '../permissions/permissions.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto, VerifyOtpDto } from './dto/password-reset.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly permissions: PermissionsService,
  ) {}

  // ---------- Session (refresh-token) lưu trong Redis ----------
  private refreshKey(userId: string, jti: string): string {
    return `refresh:${userId}:${jti}`;
  }

  /** TTL (giây) của refresh-token, suy từ cấu hình JWT_REFRESH_EXPIRES (vd '7d'). */
  private refreshTtlSeconds(): number {
    const refreshExpires = this.config.get<string>('jwt.refreshExpires') ?? '7d';
    const days = parseInt(refreshExpires, 10) || 7;
    return days * 24 * 60 * 60;
  }

  /**
   * Thu hồi MỌI phiên đăng nhập của một user (đăng xuất trên mọi thiết bị).
   *
   * Phải gọi sau khi đổi vai trò, khóa/mở khóa tài khoản hoặc đặt lại mật khẩu —
   * nếu không, người bị khóa/bị hạ quyền vẫn tiếp tục refresh được bằng token cũ.
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.redis.delByPattern(this.refreshKey(userId, '*'));
    // Xóa luôn ảnh chụp quyền: nếu chỉ thu hồi refresh-token, access token còn hạn
    // vẫn đọc được quyền cũ trong cache cho tới khi TTL hết.
    await this.permissions.invalidateUser(userId);
  }

  // ---------- Register (gửi email xác thực) ----------
  async register(dto: RegisterDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email đã được đăng ký');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    // Tài khoản mới: INACTIVE + chưa xác thực, phải xác thực email mới kích hoạt.
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      phone: dto.phone,
      role: UserRole.CUSTOMER,
      status: UserStatus.INACTIVE,
    });

    await this.sendVerification(user.id, user.email, user.fullName);
    return {
      message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.',
      email: user.email,
    };
  }

  // ---------- Email verification ----------
  private async sendVerification(userId: string, email: string, fullName: string) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.sha256(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await this.prisma.emailVerificationToken.create({ data: { userId, tokenHash, expiresAt } });

    const link = `${this.config.get<string>('frontendUrl')}/verify-email?token=${rawToken}`;
    // Gửi mail không chặn luồng: nếu SMTP lỗi, token vẫn tạo để user resend được.
    try {
      await this.mail.sendVerificationEmail(email, fullName, link);
    } catch (err) {
      this.logger.error(`Gửi email xác thực thất bại cho ${email}: ${(err as Error).message}`);
    }
  }

  async verifyEmail(token: string) {
    const tokenHash = this.sha256(token);
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Liên kết xác thực không hợp lệ hoặc đã hết hạn');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: true, status: UserStatus.ACTIVE },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { message: 'Xác thực email thành công. Bạn có thể đăng nhập.' };
  }

  async resendVerification(email: string) {
    const user = await this.users.findByEmail(email);
    if (user && !user.emailVerified) {
      await this.sendVerification(user.id, user.email, user.fullName);
    }
    return { message: 'Nếu email hợp lệ và chưa xác thực, liên kết mới đã được gửi.' };
  }

  // ---------- Login ----------
  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    if (user.status !== 'ACTIVE') {
      if (!user.emailVerified) {
        throw new UnauthorizedException(
          'Tài khoản chưa xác thực email. Vui lòng kiểm tra hộp thư.',
        );
      }
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Email hoặc mật khẩu không đúng');

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    // Trả kèm quyền hiệu lực để frontend dựng được giao diện ngay, khỏi gọi thêm /users/me.
    const access = await this.permissions.getEffective(user.id);
    const permissions = access?.isAdmin ? ['*'] : (access?.permissions ?? []);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        permissions,
      },
    };
  }

  // ---------- Refresh ----------
  async refresh(refreshToken: string) {
    let payload: JwtPayload & { jti: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }

    const key = this.refreshKey(payload.sub, payload.jti);
    const exists = await this.redis.raw.exists(key);
    if (!exists) {
      throw new UnauthorizedException('Refresh token không còn hiệu lực');
    }

    // Rotate: thu hồi token cũ (xoá key), cấp cặp mới.
    await this.redis.del(key);

    // Đọc lại user từ DB thay vì tin payload: role/status có thể đã đổi SAU khi token
    // được cấp. Nếu tin token cũ, người bị khóa hoặc bị hạ quyền sẽ giữ quyền cũ vô
    // thời hạn, vì mỗi lần refresh lại gia hạn thêm một vòng đời refresh-token.
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      await this.revokeAllSessions(payload.sub);
      throw new UnauthorizedException('Tài khoản không còn hiệu lực');
    }
    return this.issueTokens(user.id, user.email, user.role);
  }

  // ---------- Logout ----------
  async logout(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; jti: string }>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      await this.redis.del(this.refreshKey(payload.sub, payload.jti));
    } catch {
      /* im lặng: token sai thì coi như đã đăng xuất */
    }
    return { message: 'Đăng xuất thành công' };
  }

  // ---------- Forgot / Verify / Reset ----------
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.users.findByEmail(dto.email);
    // Không tiết lộ email có tồn tại hay không.
    if (!user) return { message: 'Nếu email tồn tại, mã OTP đã được gửi' };

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 phút

    await this.prisma.passwordResetOtp.create({ data: { userId: user.id, otpHash, expiresAt } });

    // Mock email provider trong dev: log + trả devOtp để test.
    this.logger.log(`OTP reset mật khẩu cho ${user.email}: ${otp}`);
    const isProd = this.config.get<string>('nodeEnv') === 'production';
    return {
      message: 'Nếu email tồn tại, mã OTP đã được gửi',
      ...(isProd ? {} : { devOtp: otp }),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    await this.findValidOtp(dto.email, dto.otp);
    return { valid: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const { user, otpRecord } = await this.findValidOtp(dto.email, dto.otp);
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.passwordResetOtp.update({
        where: { id: otpRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);
    // Thu hồi toàn bộ refresh-token hiện có của user (đăng xuất mọi thiết bị).
    await this.revokeAllSessions(user.id);
    return { message: 'Đặt lại mật khẩu thành công' };
  }

  // ---------- Helpers ----------
  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async findValidOtp(email: string, otp: string) {
    const user = await this.users.findByEmail(email);
    if (!user) throw new BadRequestException('OTP không hợp lệ');

    const records = await this.prisma.passwordResetOtp.findMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    for (const rec of records) {
      if (await bcrypt.compare(otp, rec.otpHash)) {
        return { user, otpRecord: rec };
      }
    }
    throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn');
  }

  private async issueTokens(userId: string, email: string, role: UserRole) {
    const payload: JwtPayload = { sub: userId, email, role };
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessExpires'),
    });
    const refreshToken = await this.jwt.signAsync(
      { ...payload, jti },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshExpires'),
      },
    );

    // Lưu jti vào Redis (TTL = hạn refresh) để quản lý/thu hồi refresh token.
    await this.redis.set(this.refreshKey(userId, jti), '1', this.refreshTtlSeconds());

    return { accessToken, refreshToken };
  }
}

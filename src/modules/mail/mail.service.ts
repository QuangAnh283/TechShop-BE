import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private transporter: Transporter | null = null;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const user = this.config.get<string>('mail.user');
    this.enabled = Boolean(user);
    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('mail.host'),
        port: this.config.get<number>('mail.port'),
        secure: this.config.get<boolean>('mail.secure'),
        auth: { user, pass: this.config.get<string>('mail.pass') },
      });
    } else {
      this.logger.warn('MAIL_USER chưa cấu hình → chạy chế độ log-only (không gửi email thật).');
    }
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.enabled || !this.transporter) {
      this.logger.log(`[LOG-ONLY] Email tới ${to} | ${subject}\n${html}`);
      return;
    }
    await this.transporter.sendMail({
      from: this.config.get<string>('mail.from'),
      to,
      subject,
      html,
    });
    this.logger.log(`Đã gửi email "${subject}" tới ${to}`);
  }

  async sendVerificationEmail(to: string, fullName: string, verifyLink: string): Promise<void> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
        <h2>Xác thực tài khoản</h2>
        <p>Chào ${fullName},</p>
        <p>Cảm ơn bạn đã đăng ký. Vui lòng bấm nút bên dưới để xác thực email và kích hoạt tài khoản:</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${verifyLink}"
             style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">
            Xác thực email
          </a>
        </p>
        <p style="color:#666;font-size:13px">Hoặc mở liên kết: <br>${verifyLink}</p>
        <p style="color:#666;font-size:13px">Liên kết có hiệu lực trong 24 giờ.</p>
      </div>`;
    await this.send(to, 'Xác thực tài khoản TechShop', html);
  }
}

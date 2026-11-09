import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { CreatePaymentParams, PaymentProvider, VerifyResult } from './payment-provider.interface';

/** Tích hợp VNPay (sandbox) — ký & xác thực HMAC SHA512 phía server. */
@Injectable()
export class VnpayProvider implements PaymentProvider {
  readonly name = 'VNPAY';

  constructor(private readonly config: ConfigService) {}

  createPaymentUrl(params: CreatePaymentParams): string {
    const tmnCode = this.config.get<string>('vnpay.tmnCode')!;
    const secret = this.config.get<string>('vnpay.hashSecret')!;
    const vnpUrl = this.config.get<string>('vnpay.url')!;
    const returnUrl = this.config.get<string>('vnpay.returnUrl')!;

    const data: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: params.txnRef,
      vnp_OrderInfo: params.orderInfo,
      vnp_OrderType: 'other',
      vnp_Amount: String(params.amount * 100),
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: params.ipAddr || '127.0.0.1',
      vnp_CreateDate: this.formatDate(new Date()),
    };

    const sorted = this.sortObject(data);
    const signData = this.buildQuery(sorted);
    const secureHash = createHmac('sha512', secret).update(signData, 'utf-8').digest('hex');
    return `${vnpUrl}?${signData}&vnp_SecureHash=${secureHash}`;
  }

  verify(query: Record<string, string>): VerifyResult {
    const secret = this.config.get<string>('vnpay.hashSecret')!;
    const received = query['vnp_SecureHash'];

    const clone: Record<string, string> = { ...query };
    delete clone['vnp_SecureHash'];
    delete clone['vnp_SecureHashType'];

    const sorted = this.sortObject(clone);
    const signData = this.buildQuery(sorted);
    const expected = createHmac('sha512', secret).update(signData, 'utf-8').digest('hex');

    const signatureValid = expected === received;
    const code = query['vnp_ResponseCode'];
    const txnStatus = query['vnp_TransactionStatus'];
    const amount = query['vnp_Amount'] ? Number(query['vnp_Amount']) / 100 : null;

    return {
      txnRef: query['vnp_TxnRef'],
      signatureValid,
      success: signatureValid && code === '00' && txnStatus === '00',
      amount,
      rawCode: code ?? '',
      providerData: query,
    };
  }

  // ---- Helpers theo chuẩn VNPay ----
  private sortObject(obj: Record<string, string>): Record<string, string> {
    const sorted: Record<string, string> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, '+');
    }
    return sorted;
  }

  private buildQuery(sorted: Record<string, string>): string {
    return Object.entries(sorted)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
  }

  private formatDate(d: Date): string {
    // GMT+7
    const t = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}` +
      `${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`
    );
  }
}

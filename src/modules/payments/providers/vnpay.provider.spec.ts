import { createHmac } from 'node:crypto';
import { VnpayProvider } from './vnpay.provider';

/** Test ký/verify VNPay (PART 9) với secret cố định. */
describe('VnpayProvider', () => {
  const config = {
    get: (k: string) =>
      ({
        'vnpay.tmnCode': 'TESTTMN',
        'vnpay.hashSecret': 'SECRET123',
        'vnpay.url': 'https://sandbox.vnpayment.vn/paymentv2/vnpay.html',
        'vnpay.returnUrl': 'http://localhost:3001/api/v1/payments/vnpay/return',
      })[k],
  };
  const provider = new VnpayProvider(config as never);

  it('createPaymentUrl có chữ ký + amount x100', () => {
    const url = provider.createPaymentUrl({
      orderId: 'o1',
      txnRef: 'OD123',
      amount: 1_000_000,
      orderInfo: 'Thanh toan OD123',
      ipAddr: '127.0.0.1',
    });
    expect(url).toContain('vnp_SecureHash=');
    expect(url).toContain('vnp_Amount=100000000'); // 1,000,000 x 100
    expect(url).toContain('vnp_TxnRef=OD123');
  });

  it('verify trả false khi chữ ký sai', () => {
    const result = provider.verify({
      vnp_TxnRef: 'OD123',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_Amount: '100000000',
      vnp_SecureHash: 'deadbeef',
    });
    expect(result.success).toBe(false);
  });

  it('verify trả false khi ResponseCode != 00 (dù chữ ký đúng)', () => {
    // Tự ký một bộ params có code 24 (huỷ) để chắc chắn chữ ký đúng nhưng vẫn fail.
    const base: Record<string, string> = {
      vnp_TxnRef: 'OD999',
      vnp_ResponseCode: '24',
      vnp_TransactionStatus: '02',
      vnp_Amount: '100000000',
    };
    // ký thủ công giống provider
    const sorted: Record<string, string> = {};
    for (const key of Object.keys(base).sort()) {
      sorted[key] = encodeURIComponent(base[key]).replace(/%20/g, '+');
    }
    const signData = Object.entries(sorted)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const hash = createHmac('sha512', 'SECRET123').update(signData, 'utf-8').digest('hex');
    const result = provider.verify({ ...base, vnp_SecureHash: hash });
    expect(result.success).toBe(false); // chữ ký đúng nhưng code 24
  });
});

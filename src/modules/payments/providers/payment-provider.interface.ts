/** Abstraction cổng thanh toán (PART 9.1) — dễ thay/bổ sung provider khác. */
export interface CreatePaymentParams {
  orderId: string;
  txnRef: string;
  amount: number; // VNĐ
  orderInfo: string;
  ipAddr: string;
}

export interface VerifyResult {
  txnRef: string;
  /** Chữ ký HMAC hợp lệ? (tách riêng để chặn callback giả mạo trước khi chạm DB) */
  signatureValid: boolean;
  /** signatureValid && giao dịch thành công (code/status = 00). */
  success: boolean;
  amount: number | null;
  rawCode: string;
  providerData: Record<string, string>;
}

export interface PaymentProvider {
  readonly name: string;
  createPaymentUrl(params: CreatePaymentParams): string;
  verify(query: Record<string, string>): VerifyResult;
}

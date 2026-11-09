/** Cấu hình typed, nạp từ biến môi trường. */
export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  },
  uploadsDir: process.env.UPLOADS_DIR ?? 'uploads',
  appUrl: process.env.APP_URL ?? 'http://localhost:3001',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3002',
  corsOrigin: process.env.CORS_ORIGIN ?? '',
  orderPendingTtlMinutes: parseInt(process.env.ORDER_PENDING_TTL_MINUTES ?? '30', 10),
  shipping: {
    // Phí ship cố định; miễn phí khi tổng tiền hàng >= ngưỡng.
    fee: parseInt(process.env.SHIPPING_FEE ?? '30000', 10),
    freeThreshold: parseInt(process.env.SHIPPING_FREE_THRESHOLD ?? '10000000', 10),
  },
  mail: {
    host: process.env.MAIL_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.MAIL_PORT ?? '465', 10),
    secure: (process.env.MAIL_SECURE ?? 'true') === 'true',
    user: process.env.MAIL_USER ?? '',
    pass: (process.env.MAIL_PASS ?? '').replace(/\s+/g, ''),
    from: process.env.MAIL_FROM ?? 'TechShop <no-reply@techshop.local>',
  },
  vnpay: {
    tmnCode: process.env.VNPAY_TMN_CODE ?? 'DEMOTMN',
    hashSecret: process.env.VNPAY_HASH_SECRET ?? 'DEMOSECRET',
    url: process.env.VNPAY_URL ?? 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    returnUrl: process.env.VNPAY_RETURN_URL ?? 'http://localhost:3002/payment/vnpay-return',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  media: {
    // Upload ảnh lưu vào <uploadsDir>/media, giới hạn dung lượng mỗi file (MB).
    maxSizeMb: parseInt(process.env.MEDIA_MAX_SIZE_MB ?? '5', 10),
  },
});

import * as Joi from 'joi';

/** Validate biến môi trường khi khởi động — thiếu/sai thì app không chạy. */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),
  DATABASE_URL: Joi.string().required(),
  JWT_ACCESS_SECRET: Joi.string().default('dev-access-secret'),
  JWT_ACCESS_EXPIRES: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().default('dev-refresh-secret'),
  JWT_REFRESH_EXPIRES: Joi.string().default('7d'),
  UPLOADS_DIR: Joi.string().default('uploads'),
  APP_URL: Joi.string().default('http://localhost:3001'),
  CORS_ORIGIN: Joi.string().allow('').default(''),
  ORDER_PENDING_TTL_MINUTES: Joi.number().default(30),
  SHIPPING_FEE: Joi.number().default(30000),
  SHIPPING_FREE_THRESHOLD: Joi.number().default(10000000),
  MAIL_HOST: Joi.string().default('smtp.gmail.com'),
  MAIL_PORT: Joi.number().default(465),
  MAIL_SECURE: Joi.string().valid('true', 'false').default('true'),
  MAIL_USER: Joi.string().allow('').default(''),
  MAIL_PASS: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().default('TechShop <no-reply@techshop.local>'),
  VNPAY_TMN_CODE: Joi.string().default('DEMOTMN'),
  VNPAY_HASH_SECRET: Joi.string().default('DEMOSECRET'),
  VNPAY_URL: Joi.string().default('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'),
  VNPAY_RETURN_URL: Joi.string().default('http://localhost:3001/api/v1/payments/vnpay/return'),
  // Redis (cache + session)
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  // Media upload (local disk)
  MEDIA_MAX_SIZE_MB: Joi.number().default(5),
});

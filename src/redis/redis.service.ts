import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PaginatedResult } from '../common/dto/pagination.dto';

/**
 * Bọc ioredis thành provider dùng chung: cache đọc (JSON + TTL) và lưu session.
 * Lỗi Redis không được làm sập request — các helper cache đều fail-open.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.client = new Redis({
      host: this.config.get<string>('redis.host'),
      port: this.config.get<number>('redis.port'),
      password: this.config.get<string>('redis.password') || undefined,
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      // Không spam log khi Redis tạm thời chưa sẵn sàng.
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    this.client.on('ready', () => {
      this.ready = true;
      this.logger.log('Redis connected');
    });
    this.client.on('error', (err) => {
      this.ready = false;
      this.logger.warn(`Redis error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }

  /** Client thô cho các thao tác đặc thù. */
  get raw(): Redis {
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const raw = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) await this.client.set(key, raw, 'EX', ttlSeconds);
      else await this.client.set(key, raw);
    } catch {
      /* fail-open: cache lỗi thì bỏ qua */
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.client.del(...keys);
    } catch {
      /* ignore */
    }
  }

  /** Xoá theo pattern (dùng SCAN, an toàn hơn KEYS). */
  async delByPattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, found] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (found.length) await this.client.del(...found);
      } while (cursor !== '0');
    } catch {
      /* ignore */
    }
  }

  /**
   * Trả cache nếu có, ngược lại chạy `fn`, lưu kết quả rồi trả về.
   * Redis hỏng → chạy thẳng `fn` (không cache), không ném lỗi.
   */
  async withCache<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await fn();
    if (fresh !== undefined && fresh !== null) await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  /**
   * Cache cho endpoint list phân trang. **Dùng cái này, đừng dùng `withCache` trực tiếp.**
   *
   * Lý do: cache đi qua JSON.stringify/parse nên **mất prototype** của class instance.
   * `TransformInterceptor` nhận diện kết quả list bằng `instanceof PaginatedResult` để tách
   * `data`/`meta`; nếu cache nguyên instance thì lần cache HIT trả về object thuần, interceptor
   * không nhận ra, `data` thành `{items, meta}` thay vì mảng → frontend vỡ
   * (`...items.map is not a function`). Helper này chỉ cache phần dữ liệu thuần và luôn
   * dựng lại `PaginatedResult` trước khi trả, nên không thể dính lỗi đó.
   */
  async withCachedList<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<PaginatedResult<T>>,
  ): Promise<PaginatedResult<T>> {
    const cached = await this.withCache(key, ttlSeconds, async () => {
      const result = await fn();
      return { items: result.items, meta: result.meta };
    });
    return new PaginatedResult(cached.items, cached.meta);
  }
}

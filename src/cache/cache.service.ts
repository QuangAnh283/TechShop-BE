import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PaginatedResult } from '../common/dto/pagination.dto';

interface CacheEntry {
  /** Giá trị đã serialize — xem ghi chú "vì sao lưu JSON" ở dưới. */
  json: string;
  /** Mốc hết hạn (epoch ms). */
  expiresAt: number;
}

/**
 * Cache đọc trong bộ nhớ tiến trình. Thay cho Redis (đã gỡ khỏi dự án).
 *
 * API giữ **y nguyên** bản Redis cũ (`withCache`, `withCachedList`, `del`, `delByPattern`)
 * nên 24 call site ở products/categories/brands/admin không phải sửa gì.
 *
 * Đánh đổi đã biết và chấp nhận: cache nằm trong RAM của tiến trình nên (a) mất khi
 * restart, (b) không chia sẻ được nếu chạy nhiều instance. Đồ án chạy **một tiến trình**
 * nên cả hai đều không ảnh hưởng; bù lại không phải cài thêm hạ tầng.
 *
 * **Vì sao lưu JSON string chứ không giữ nguyên tham chiếu object:**
 * 1. Giữ tham chiếu thì caller có thể vô tình sửa đúng object đang nằm trong cache,
 *    làm "nhiễm độc" cache cho mọi request sau. Serialize = mỗi lần lấy ra là một bản sao.
 * 2. Giữ đúng hành vi của bản Redis (mất prototype sau khi qua JSON), nên bất biến
 *    "cache list phải dùng `withCachedList`" vẫn đúng y như tài liệu — xem `withCachedList`.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  /**
   * Chặn trên số lượng khóa. CẦN THIẾT: khóa cache danh sách sản phẩm sinh từ
   * `JSON.stringify(query)`, nên client gọi `/products?page=1..100000` sẽ tạo vô số
   * khóa khác nhau. Redis có `maxmemory` + eviction lo việc này; Map thì không, nếu
   * không chặn thì heap phình tới khi sập. Vượt ngưỡng thì đẩy khóa cũ nhất ra (FIFO).
   */
  private static readonly MAX_ENTRIES = 500;
  /** Chu kỳ quét dọn khóa đã hết hạn nhưng không ai đọc tới. */
  private static readonly SWEEP_MS = 60_000;

  private readonly store = new Map<string, CacheEntry>();
  private sweeper?: NodeJS.Timeout;

  onModuleInit(): void {
    this.sweeper = setInterval(() => this.sweep(), CacheService.SWEEP_MS);
    // unref: timer không được giữ tiến trình sống (quan trọng khi chạy Jest).
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.store.clear();
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    // Hết hạn thì coi như không có (dọn lười, không chờ tới lượt sweep).
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.json) as T;
    } catch {
      this.store.delete(key);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    let json: string;
    try {
      json = JSON.stringify(value);
    } catch {
      return; // không serialize được (vòng lặp tham chiếu…) → bỏ qua, không cache
    }
    if (json === undefined) return;

    // Ghi lại khóa cũ: xóa trước để nó về cuối hàng đợi FIFO.
    this.store.delete(key);
    if (this.store.size >= CacheService.MAX_ENTRIES) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : 60;
    this.store.set(key, { json, expiresAt: Date.now() + ttl * 1000 });
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) this.store.delete(key);
  }

  /** Xoá theo pattern kiểu glob (`*`), vd `cache:products:*`. */
  async delByPattern(pattern: string): Promise<void> {
    const rx = CacheService.globToRegExp(pattern);
    for (const key of [...this.store.keys()]) {
      if (rx.test(key)) this.store.delete(key);
    }
  }

  /** Trả cache nếu còn hạn, ngược lại chạy `fn`, lưu kết quả rồi trả về. */
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

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }

  private static globToRegExp(pattern: string): RegExp {
    const escaped = pattern
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${escaped}$`);
  }
}

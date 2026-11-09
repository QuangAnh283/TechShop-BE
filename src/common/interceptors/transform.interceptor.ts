import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PaginatedResult } from '../dto/pagination.dto';

/** Chuẩn hóa mọi response thành công: { success, statusCode, data, (meta), timestamp, path }. */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    return next.handle().pipe(
      map((value) => {
        const base = {
          success: true,
          statusCode: res.statusCode,
          timestamp: new Date().toISOString(),
          path: req.originalUrl ?? req.url,
        };
        if (value instanceof PaginatedResult) {
          return { ...base, data: value.items, meta: value.meta };
        }
        return { ...base, data: value ?? null };
      }),
    );
  }
}

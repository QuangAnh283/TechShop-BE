import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/** Log mỗi request: method, url, thời gian xử lý. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method } = req;
    const url = req.originalUrl ?? req.url;
    const started = Date.now();

    return next
      .handle()
      .pipe(tap(() => this.logger.log(`${method} ${url} - ${Date.now() - started}ms`)));
  }
}

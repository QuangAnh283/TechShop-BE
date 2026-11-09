import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Chuẩn hóa mọi lỗi: { success:false, statusCode, message, error, timestamp, path }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Đã xảy ra lỗi hệ thống';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const b = body as Record<string, unknown>;
        message = (b.message as string | string[]) ?? message;
        error = (b.error as string) ?? exception.name;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'Dữ liệu đã tồn tại (vi phạm ràng buộc duy nhất)';
          error = 'Conflict';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Không tìm thấy bản ghi';
          error = 'Not Found';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Vi phạm ràng buộc khóa ngoại';
          error = 'Bad Request';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'Lỗi truy vấn dữ liệu';
          error = 'Bad Request';
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({
      success: false,
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: req.originalUrl ?? req.url,
    });
  }
}

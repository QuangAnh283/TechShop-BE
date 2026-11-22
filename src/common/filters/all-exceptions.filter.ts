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
    } else if (
      exception instanceof Prisma.PrismaClientUnknownRequestError ||
      exception instanceof Prisma.PrismaClientRustPanicError
    ) {
      // Prisma KHÔNG map được mọi lỗi DB. Ví dụ thật: xoá một `Category` còn sản phẩm →
      // PostgreSQL ném **23001 `restrict_violation`**, nhưng Prisma chỉ map 23503 thành
      // `P2003`, nên lỗi rơi xuống đây chứ không vào nhánh KnownRequestError ở trên.
      // ⚠️ `exception.message` của Prisma chứa đường dẫn file nguồn trên máy chủ, tên
      // bảng và tên ràng buộc — TUYỆT ĐỐI không trả ra client (xem `message` mặc định).
      if (/\b23001\b|\b23503\b/.test(exception.message)) {
        status = HttpStatus.CONFLICT;
        message = 'Không thể xóa: dữ liệu này đang được bản ghi khác sử dụng';
        error = 'Conflict';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Dữ liệu gửi lên không hợp lệ';
      error = 'Bad Request';
    }
    // Mọi `Error` còn lại giữ nguyên message mặc định 'Đã xảy ra lỗi hệ thống'.
    // Trước đây nhánh này gán `message = exception.message` và đã làm lộ nguyên văn lỗi
    // Prisma (kèm đường dẫn `...\src\modules\categories\categories.service.ts:63`) ra
    // giao diện. Lỗi không phải `HttpException` là bug của server, không phải thông báo
    // dành cho người dùng — chi tiết chỉ ghi vào log.

    // Log mọi lỗi KHÔNG phải HttpException: 4xx đã map (vd 409 ở trên) cũng đáng biết,
    // vì nó nghĩa là có đường ghi chưa kiểm ràng buộc trước khi gọi DB.
    if (!(exception instanceof HttpException)) {
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

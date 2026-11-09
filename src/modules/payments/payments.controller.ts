import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':orderId/vnpay/create')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  create(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string; socket?: { remoteAddress?: string } },
  ) {
    const ip = req.ip ?? req.socket?.remoteAddress ?? '127.0.0.1';
    return this.paymentsService.createVnpayUrl(orderId, user.id, ip);
  }

  /** VNPay chuyển hướng người dùng về đây sau khi thanh toán. */
  @Get('vnpay/return')
  vnpayReturn(@Query() query: Record<string, string>) {
    return this.paymentsService.handleVnpayReturn(query);
  }

  /** IPN server-to-server (dùng chung logic verify). */
  @Get('vnpay/ipn')
  vnpayIpn(@Query() query: Record<string, string>) {
    return this.paymentsService.handleVnpayReturn(query);
  }
}

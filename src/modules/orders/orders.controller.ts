import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERM } from '../../common/authz/permissions';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  CreateOrderDto,
  QueryOrderDto,
  RefundOrderDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.createFromCart(user.id, dto);
  }

  @Get()
  myOrders(@CurrentUser() user: AuthUser, @Query() query: QueryOrderDto) {
    return this.ordersService.findAllForUser(user.id, query);
  }

  @Get('all')
  @RequirePermissions(PERM.ORDER_READ_ALL)
  all(@Query() query: QueryOrderDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.findOne(id, user);
  }

  @Patch(':id/status')
  @RequirePermissions(PERM.ORDER_PROCESS)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.updateStatus(id, dto.status, user);
  }

  @Post(':id/refund')
  @RequirePermissions(PERM.ORDER_REFUND)
  refund(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: RefundOrderDto) {
    return this.ordersService.refund(id, user, dto);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.cancel(id, user);
  }
}

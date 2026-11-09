import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/cart.dto';

@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: AuthUser) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  addItem(@CurrentUser() user: AuthUser, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.id, dto.deviceId);
  }

  @Delete('items/:deviceId')
  removeItem(@CurrentUser() user: AuthUser, @Param('deviceId') deviceId: string) {
    return this.cartService.removeItem(user.id, deviceId);
  }

  @Delete()
  clear(@CurrentUser() user: AuthUser) {
    return this.cartService.clear(user.id);
  }

  @Get('validate')
  validate(@CurrentUser() user: AuthUser) {
    return this.cartService.validate(user.id);
  }
}

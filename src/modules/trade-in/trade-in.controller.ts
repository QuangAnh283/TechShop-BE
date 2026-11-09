import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateRequestDto, EstimateDto } from './dto/trade-in.dto';
import { TradeInService } from './trade-in.service';

@ApiTags('trade-in')
@Controller('trade-in')
export class TradeInController {
  constructor(private readonly tradeInService: TradeInService) {}

  @Get('questions')
  listQuestions(@Query('category') categoryId?: string) {
    return this.tradeInService.listQuestions(categoryId);
  }

  /** Danh sách sản phẩm đủ điều kiện thu cũ (có rule đang bật) — cho bước chọn máy ở FE. */
  @Get('products')
  listTradeInProducts(@Query('category') category?: string, @Query('q') q?: string) {
    return this.tradeInService.listTradeInProducts(category, q);
  }

  @Post('estimate')
  @HttpCode(200)
  estimate(@Body() dto: EstimateDto) {
    return this.tradeInService.estimate(dto);
  }

  @Post('requests')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  createRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto) {
    return this.tradeInService.createRequest(user.id, dto);
  }

  @Get('requests')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  myRequests(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.tradeInService.findMine(user.id, query);
  }

  @Get('requests/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tradeInService.findOne(id, user);
  }

  @Post('requests/:id/accept')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tradeInService.respond(id, user, true);
  }

  @Post('requests/:id/reject')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tradeInService.respond(id, user, false);
  }
}

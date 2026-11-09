import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERM } from '../../common/authz/permissions';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  AssignTechnicianDto,
  CreateQuestionDto,
  InspectDto,
  QueryTradeInDto,
  UpdateTradeInStatusDto,
  UpsertRuleDto,
} from './dto/trade-in.dto';
import { TradeInService } from './trade-in.service';

@ApiTags('trade-in-manage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('trade-in/manage')
export class TradeInManageController {
  constructor(private readonly tradeInService: TradeInService) {}

  // ---- Bo cau hoi & quy tac dinh gia ----
  @Post('questions')
  @RequirePermissions(PERM.TRADEIN_CONFIG)
  createQuestion(@Body() dto: CreateQuestionDto) {
    return this.tradeInService.createQuestion(dto);
  }

  @Delete('questions/:id')
  @RequirePermissions(PERM.TRADEIN_CONFIG)
  deleteQuestion(@Param('id') id: string) {
    return this.tradeInService.deleteQuestion(id);
  }

  @Put('rules')
  @RequirePermissions(PERM.TRADEIN_CONFIG)
  upsertRule(@Body() dto: UpsertRuleDto) {
    return this.tradeInService.upsertRule(dto);
  }

  // ---- Yeu cau thu cu ----
  @Get('requests')
  @RequirePermissions(PERM.TRADEIN_READ)
  findAll(@Query() query: QueryTradeInDto) {
    return this.tradeInService.findAll(query);
  }

  @Patch('requests/:id/assign')
  @RequirePermissions(PERM.TRADEIN_ASSIGN)
  assign(@Param('id') id: string, @Body() dto: AssignTechnicianDto) {
    return this.tradeInService.assign(id, dto.technicianId);
  }

  @Post('requests/:id/inspect')
  @RequirePermissions(PERM.TRADEIN_INSPECT)
  inspect(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: InspectDto) {
    return this.tradeInService.inspect(id, user.id, dto, user);
  }

  @Patch('requests/:id/status')
  @RequirePermissions(PERM.TRADEIN_COMPLETE)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTradeInStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    const { status, ...importOpts } = dto;
    return this.tradeInService.updateStatus(id, status, importOpts, user);
  }

  /** Đánh dấu đã trả máy cho khách (yêu cầu đã bị từ chối mà máy từng nhận về). */
  @Patch('requests/:id/return')
  @RequirePermissions(PERM.TRADEIN_COMPLETE)
  returnDevice(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.tradeInService.returnDevice(id, user);
  }
}

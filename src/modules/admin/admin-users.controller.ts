import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminUsersService } from './admin-users.service';
import {
  CreateStaffDto,
  QueryUsersDto,
  UpdateRoleDto,
  UpdateUserStatusDto,
} from './dto/admin-user.dto';

@ApiTags('admin-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  list(@Query() query: QueryUsersDto) {
    return this.adminUsersService.list(query);
  }

  @Post()
  createStaff(@Body() dto: CreateStaffDto) {
    return this.adminUsersService.createStaff(dto);
  }

  @Patch(':id/role')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() actor: AuthUser) {
    return this.adminUsersService.updateRole(id, dto, actor);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.adminUsersService.updateStatus(id, dto, actor);
  }
}

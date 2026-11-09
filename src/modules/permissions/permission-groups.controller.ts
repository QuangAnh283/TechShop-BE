import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PERMISSION_CATALOG } from '../../common/authz/permissions';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  AssignGroupDto,
  CreatePermissionGroupDto,
  UpdatePermissionGroupDto,
} from './dto/permission-group.dto';
import { PermissionGroupsService } from './permission-groups.service';

/**
 * Quản trị nhóm quyền — CHỈ ADMIN, cố ý không gắn mã quyền nào.
 * Nếu cấp được quyền này cho nhân viên thì họ tự sửa nhóm của mình thành toàn quyền.
 */
@ApiTags('admin-permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class PermissionGroupsController {
  constructor(private readonly groups: PermissionGroupsService) {}

  /** Danh mục mã quyền + nhãn tiếng Việt để frontend dựng lưới chọn quyền. */
  @Get('permissions')
  catalog() {
    return PERMISSION_CATALOG;
  }

  @Get('permission-groups')
  findAll() {
    return this.groups.findAll();
  }

  @Post('permission-groups')
  create(@Body() dto: CreatePermissionGroupDto, @CurrentUser() user: AuthUser) {
    return this.groups.create(dto, user);
  }

  @Patch('permission-groups/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePermissionGroupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.groups.update(id, dto, user);
  }

  @Delete('permission-groups/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.groups.remove(id, user);
  }

  @Put('users/:id/group')
  assign(@Param('id') id: string, @Body() dto: AssignGroupDto, @CurrentUser() user: AuthUser) {
    return this.groups.assignUser(id, dto.groupId ?? null, user);
  }
}

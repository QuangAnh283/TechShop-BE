import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERM } from '../../common/authz/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @RequirePermissions(PERM.REPORT_READ)
  dashboard() {
    return this.adminService.dashboard();
  }

  @Get('reports/revenue')
  @RequirePermissions(PERM.REPORT_READ)
  revenue(@Query('days') days?: string) {
    return this.adminService.revenueByDay(days ? Number(days) : 30);
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERM } from '../../common/authz/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions(PERM.AUDIT_READ)
  list(@Query() query: QueryAuditDto) {
    return this.auditService.list(query);
  }

  @Get('actions')
  @RequirePermissions(PERM.AUDIT_READ)
  actions() {
    return this.auditService.listActions();
  }
}

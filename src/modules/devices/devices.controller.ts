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
import { DevicesService } from './devices.service';
import {
  CreateDeviceDto,
  CreateRepairDto,
  CreateWarrantyDto,
  QueryDeviceDto,
  UpdateDeviceDto,
} from './dto/device.dto';

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @RequirePermissions(PERM.INVENTORY_READ)
  findAll(@Query() query: QueryDeviceDto) {
    return this.devicesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERM.INVENTORY_READ)
  findOne(@Param('id') id: string) {
    return this.devicesService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERM.INVENTORY_MANAGE)
  create(@Body() dto: CreateDeviceDto) {
    return this.devicesService.create(dto);
  }

  // Sửa được thiết bị nhưng KHÔNG đương nhiên sửa được giá — service lọc theo
  // quyền price.update (chặn mức field, guard không làm được).
  @Patch(':id')
  @RequirePermissions(PERM.INVENTORY_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto, @CurrentUser() user: AuthUser) {
    return this.devicesService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERM.INVENTORY_MANAGE)
  remove(@Param('id') id: string) {
    return this.devicesService.remove(id);
  }

  @Put(':id/warranty')
  @RequirePermissions(PERM.DEVICE_WARRANTY)
  setWarranty(@Param('id') id: string, @Body() dto: CreateWarrantyDto) {
    return this.devicesService.setWarranty(id, dto);
  }

  @Get(':id/repairs')
  @RequirePermissions(PERM.DEVICE_REPAIR, PERM.INVENTORY_READ)
  listRepairs(@Param('id') id: string) {
    return this.devicesService.listRepairs(id);
  }

  @Post(':id/repairs')
  @RequirePermissions(PERM.DEVICE_REPAIR)
  addRepair(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: CreateRepairDto) {
    return this.devicesService.addRepair(id, user.id, dto);
  }
}

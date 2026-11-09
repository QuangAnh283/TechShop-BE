import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERM } from '../../common/authz/permissions';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CreateWarehouseDto, ExportDeviceDto, ImportDeviceDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('summary')
  @RequirePermissions(PERM.INVENTORY_READ)
  summary() {
    return this.inventoryService.summary();
  }

  // ImportDeviceDto mang theo purchasePrice/sellingPrice -> service lọc theo quyền giá.
  @Post('import')
  @RequirePermissions(PERM.INVENTORY_MANAGE)
  importDevice(@CurrentUser() user: AuthUser, @Body() dto: ImportDeviceDto) {
    return this.inventoryService.importDevice(dto, user);
  }

  @Post(':deviceId/export')
  @RequirePermissions(PERM.INVENTORY_MANAGE)
  exportDevice(
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ExportDeviceDto,
  ) {
    return this.inventoryService.exportDevice(deviceId, dto, user.id);
  }

  @Get(':deviceId/history')
  @RequirePermissions(PERM.INVENTORY_READ)
  history(@Param('deviceId') deviceId: string) {
    return this.inventoryService.history(deviceId);
  }

  @Get('warehouses')
  @RequirePermissions(PERM.INVENTORY_READ)
  listWarehouses() {
    return this.inventoryService.listWarehouses();
  }

  @Post('warehouses')
  @RequirePermissions(PERM.WAREHOUSE_MANAGE)
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(dto);
  }
}

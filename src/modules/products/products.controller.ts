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
import { CreateProductDto, ReplaceSpecsDto, UpdateProductDto } from './dto/product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: QueryProductDto) {
    return this.productsService.findAll(query);
  }

  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.productsService.findOne(idOrSlug);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERM.PRODUCT_MANAGE)
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERM.PRODUCT_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: AuthUser) {
    return this.productsService.update(id, dto, user);
  }

  @Put(':id/specs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERM.PRODUCT_MANAGE)
  replaceSpecs(@Param('id') id: string, @Body() dto: ReplaceSpecsDto) {
    return this.productsService.replaceSpecs(id, dto);
  }

  @Post(':id/deactivate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERM.PRODUCT_MANAGE)
  deactivate(@Param('id') id: string) {
    return this.productsService.deactivate(id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERM.PRODUCT_DELETE)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}

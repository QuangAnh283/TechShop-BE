import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PRODUCT_SORTS, type ProductSort } from '../../../common/utils/product-sort.util';

export class QueryProductDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo slug danh mục' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({ description: 'Từ khóa tìm theo tên' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: ProductSort = 'newest';

  @ApiPropertyOptional({ description: 'true/false' })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;
}

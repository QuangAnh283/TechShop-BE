import { ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceCondition } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export const SEARCH_SORTS = ['newest', 'price_asc', 'price_desc', 'name_asc'] as const;

export class SearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Từ khóa (full-text)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Slug danh mục' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandId?: string;

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

  @ApiPropertyOptional({
    enum: DeviceCondition,
    description: 'Chỉ sản phẩm còn máy tình trạng này',
  })
  @IsOptional()
  @IsEnum(DeviceCondition)
  condition?: DeviceCondition;

  @ApiPropertyOptional({ description: 'Lọc theo giá trị spec RAM (vd 8GB)' })
  @IsOptional()
  @IsString()
  ram?: string;

  @ApiPropertyOptional({ description: 'Lọc theo giá trị spec bộ nhớ (vd 256GB)' })
  @IsOptional()
  @IsString()
  storage?: string;

  @ApiPropertyOptional({ enum: SEARCH_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(SEARCH_SORTS)
  sort?: (typeof SEARCH_SORTS)[number] = 'newest';
}

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class SpecItemDto {
  @ApiProperty({ example: 'RAM' })
  @IsString()
  name: string;

  @ApiProperty({ example: '8GB' })
  @IsString()
  value: string;
}

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  categoryId: string;

  @ApiProperty()
  @IsString()
  brandId: string;

  @ApiProperty({ example: 'iPhone 13 128GB' })
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'ID MediaAsset cho ảnh đại diện' })
  @IsOptional()
  @IsString()
  thumbnailMediaId?: string;

  @ApiPropertyOptional({ description: 'Giá tham khảo máy mới (VNĐ)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  basePriceNew?: number;

  @ApiPropertyOptional({ type: [String], description: 'Danh sách ID MediaAsset cho gallery' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageMediaIds?: string[];

  @ApiPropertyOptional({ type: [SpecItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecItemDto)
  specs?: SpecItemDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReplaceSpecsDto {
  @ApiProperty({ type: [SpecItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecItemDto)
  specs: SpecItemDto[];
}

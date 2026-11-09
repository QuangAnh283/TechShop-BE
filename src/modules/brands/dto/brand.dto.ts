import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class CreateBrandDto {
  @ApiProperty({ example: 'Apple' })
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ description: 'ID MediaAsset cho logo' })
  @IsOptional()
  @IsString()
  logoMediaId?: string;
}

export class UpdateBrandDto extends PartialType(CreateBrandDto) {}

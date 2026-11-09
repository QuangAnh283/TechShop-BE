import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { DeviceCondition, DeviceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateDeviceDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ example: '356789012345678' })
  @IsString()
  serialImei: string;

  @ApiProperty({ enum: DeviceCondition })
  @IsEnum(DeviceCondition)
  condition: DeviceCondition;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryHealth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  purchasePrice?: number;

  @ApiProperty({ description: 'Giá bán (VNĐ)' })
  @IsInt()
  @Min(0)
  sellingPrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  warehouseId?: string;
}

export class UpdateDeviceDto extends PartialType(CreateDeviceDto) {
  @ApiPropertyOptional({ enum: DeviceStatus })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;
}

export class QueryDeviceDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ enum: DeviceStatus })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiPropertyOptional({ enum: DeviceCondition })
  @IsOptional()
  @IsEnum(DeviceCondition)
  condition?: DeviceCondition;

  @ApiPropertyOptional({ description: 'Tìm theo Serial/IMEI' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateWarrantyDto {
  @ApiProperty({ example: '2026-01-01' })
  @Type(() => Date)
  startDate: Date;

  @ApiProperty({ example: '2026-07-01' })
  @Type(() => Date)
  endDate: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateRepairDto {
  @ApiProperty({ example: '2026-02-15' })
  @Type(() => Date)
  repairDate: Date;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  partsReplaced?: string;
}

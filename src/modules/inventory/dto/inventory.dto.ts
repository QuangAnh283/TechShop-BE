import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CreateDeviceDto } from '../../devices/dto/device.dto';

export class ImportDeviceDto extends CreateDeviceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class ExportDeviceDto {
  @ApiPropertyOptional({ enum: DeviceStatus, description: 'Trạng thái sau xuất kho' })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateWarehouseDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}

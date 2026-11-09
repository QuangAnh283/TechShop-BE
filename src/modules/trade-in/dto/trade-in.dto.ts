import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceCondition, TradeInStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class OptionInput {
  @ApiProperty()
  @IsString()
  label: string;

  @ApiProperty({ description: 'Số tiền điều chỉnh (âm = trừ), VNĐ' })
  @IsInt()
  priceAdjustment: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateQuestionDto {
  @ApiProperty()
  @IsString()
  text: string;

  @ApiPropertyOptional({ description: 'Áp dụng cho 1 danh mục; bỏ trống = áp dụng chung' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiProperty({ type: [OptionInput] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OptionInput)
  options: OptionInput[];
}

export class UpsertRuleDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ description: 'Giá gốc thu mua (VNĐ)' })
  @IsInt()
  @Min(0)
  basePrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class EstimateDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ type: [String], description: 'Danh sách optionId đã chọn' })
  @IsArray()
  @IsString({ each: true })
  optionIds: string[];
}

export class CreateRequestDto extends EstimateDto {
  @ApiPropertyOptional({ description: 'IMEI/Serial máy khách đang có' })
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiPropertyOptional({ description: 'Mô tả tình trạng máy (khách tự ghi)' })
  @IsOptional()
  @IsString()
  deviceDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class InspectDto {
  @ApiPropertyOptional({ enum: DeviceCondition })
  @IsOptional()
  @IsEnum(DeviceCondition)
  actualCondition?: DeviceCondition;

  @ApiProperty({ description: 'Giá chốt sau kiểm định (VNĐ)' })
  @IsInt()
  @Min(0)
  adjustedPrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ type: [String], description: 'Danh sách ID MediaAsset ảnh kiểm định' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceMediaIds?: string[];
}

export class AssignTechnicianDto {
  @ApiProperty()
  @IsString()
  technicianId: string;
}

export class UpdateTradeInStatusDto {
  @ApiProperty({ enum: TradeInStatus })
  @IsEnum(TradeInStatus)
  status: TradeInStatus;

  // Ba field dưới chỉ dùng khi status = COMPLETED (lúc nhập máy vào kho).
  @ApiPropertyOptional({
    description: 'IMEI/Serial thực tế khi nhập kho (mặc định lấy IMEI khách khai)',
  })
  @IsOptional()
  @IsString()
  serialImei?: string;

  @ApiPropertyOptional({ description: 'Giá thu vào (VNĐ) — mặc định lấy giá đã chốt' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional({ description: 'Giá bán lại (VNĐ) — mặc định = giá thu vào +20%' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sellingPrice?: number;
}

export class QueryTradeInDto {
  @ApiPropertyOptional({ enum: TradeInStatus })
  @IsOptional()
  @IsEnum(TradeInStatus)
  status?: TradeInStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit = 20;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

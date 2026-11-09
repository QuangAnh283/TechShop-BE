import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateAddressDto {
  @ApiProperty()
  @IsString()
  @Length(2, 100)
  fullName: string;

  @ApiProperty({ example: '0901234567' })
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone: string;

  @ApiProperty({ example: '123 Đường ABC' })
  @IsString()
  @Length(2, 255)
  line: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ward?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}

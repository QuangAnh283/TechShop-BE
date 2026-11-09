import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 100)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0)' })
  phone?: string;
}

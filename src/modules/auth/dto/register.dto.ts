import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'Password@123' })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  @Matches(/[A-Za-z]/, { message: 'Mật khẩu phải có chữ' })
  @Matches(/\d/, { message: 'Mật khẩu phải có số' })
  password: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @Length(2, 100)
  fullName: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;
}

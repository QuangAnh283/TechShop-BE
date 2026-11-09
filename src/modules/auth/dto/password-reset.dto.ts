import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;
}

export class VerifyOtpDto {
  @ApiProperty()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'OTP gồm 6 chữ số' })
  otp: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  otp: string;

  @ApiProperty({ example: 'NewPass@123' })
  @IsString()
  @MinLength(8)
  @Matches(/[A-Za-z]/, { message: 'Mật khẩu phải có chữ' })
  @Matches(/\d/, { message: 'Mật khẩu phải có số' })
  newPassword: string;
}

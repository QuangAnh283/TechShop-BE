import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'NewPass@123' })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới tối thiểu 8 ký tự' })
  @Matches(/[A-Za-z]/, { message: 'Mật khẩu phải có chữ' })
  @Matches(/\d/, { message: 'Mật khẩu phải có số' })
  newPassword: string;
}

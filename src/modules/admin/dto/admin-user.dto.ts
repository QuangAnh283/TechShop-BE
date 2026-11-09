import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  MinLength,
} from 'class-validator';

export class CreateStaffDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Staff@123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  @Length(2, 100)
  fullName: string;

  @ApiProperty({ enum: UserRole, example: 'TECHNICIAN' })
  @IsEnum(UserRole)
  role: UserRole;
}

export class UpdateRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus })
  @IsEnum(UserStatus)
  status: UserStatus;
}

export class QueryUsersDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

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

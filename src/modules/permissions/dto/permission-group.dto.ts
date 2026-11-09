import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ASSIGNABLE_PERMISSIONS, Permission } from '../../../common/authz/permissions';

export class CreatePermissionGroupDto {
  @ApiProperty({ description: 'Mã nhóm (chữ HOA, gạch dưới) — không đổi được về sau' })
  @IsString()
  @Length(2, 40)
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'Mã nhóm chỉ gồm chữ in hoa, số và dấu gạch dưới' })
  code: string;

  @ApiProperty({ description: 'Tên hiển thị' })
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;

  @ApiProperty({ type: [String], description: 'Danh sách mã quyền' })
  @IsArray()
  // Chỉ nhận mã GÁN ĐƯỢC: `user.manage`/`permission.manage`/`audit.read` bị loại ở đây,
  // nếu không một nhân viên có quyền sửa nhóm sẽ tự nâng mình thành toàn quyền.
  @IsIn(ASSIGNABLE_PERMISSIONS, {
    each: true,
    message: 'Mã quyền không hợp lệ hoặc không được phép gán',
  })
  permissions: Permission[];
}

/** Sửa nhóm: không cho đổi `code` (là khóa ổn định dùng để upsert nhóm preset). */
export class UpdatePermissionGroupDto extends PartialType(CreatePermissionGroupDto) {
  @ApiPropertyOptional({ readOnly: true })
  @IsOptional()
  code?: never;
}

export class AssignGroupDto {
  @ApiPropertyOptional({ description: 'ID nhóm quyền; null để gỡ khỏi mọi nhóm' })
  @IsOptional()
  @IsString()
  groupId?: string | null;
}

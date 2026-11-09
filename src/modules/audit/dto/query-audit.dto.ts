import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QueryAuditDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo mã hành động' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Lọc theo loại đối tượng' })
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional({ description: 'Lọc theo email người thực hiện (chứa)' })
  @IsOptional()
  @IsString()
  actor?: string;
}

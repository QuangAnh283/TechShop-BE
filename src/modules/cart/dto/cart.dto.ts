import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({ description: 'ID của thiết bị (device) muốn thêm' })
  @IsString()
  deviceId: string;
}

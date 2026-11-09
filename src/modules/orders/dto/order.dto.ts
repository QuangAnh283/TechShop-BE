import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, PaymentProvider } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateOrderDto {
  @ApiPropertyOptional({ description: 'ID địa chỉ giao hàng của người dùng' })
  @IsOptional()
  @IsString()
  addressId?: string;

  @ApiPropertyOptional({ enum: PaymentProvider, default: 'VNPAY', description: 'VNPAY hoặc COD' })
  @IsOptional()
  @IsEnum(PaymentProvider)
  paymentMethod?: PaymentProvider;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

export class RefundOrderDto {
  @ApiPropertyOptional({ description: 'Lý do hoàn tiền (ghi vào nhật ký)' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Khách đã trả lại máy chưa. CHỈ có tác dụng với đơn đã DELIVERED: để false/bỏ trống ' +
      'thì máy KHÔNG được nhập lại kho (vì nó đang ở chỗ khách). Đơn chưa giao xong luôn ' +
      'được hoàn kho bất kể cờ này.',
  })
  @IsOptional()
  @IsBoolean()
  goodsReturned?: boolean;
}

export class QueryOrderDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

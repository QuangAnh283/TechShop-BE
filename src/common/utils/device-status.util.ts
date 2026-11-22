import { BadRequestException } from '@nestjs/common';
import { DeviceStatus } from '@prisma/client';

/**
 * Bảng chuyển trạng thái của MÁY VẬT LÝ (`Device`) — **nguồn luật duy nhất**.
 * Cùng pattern với `TRANSITIONS` (đơn hàng) và `TI_TRANSITIONS` (thu cũ).
 *
 * Hai nhóm trạng thái có bản chất khác nhau:
 *  - **Vật lý** (`IN_STOCK`, `INSPECTING`, `DEFECTIVE`) — người dùng quan sát rồi đặt.
 *  - **Thuộc vòng đời đơn hàng** (`RESERVED`, `SOLD`) — là *kết quả* của đơn hàng,
 *    không phải thứ ai đó tự đặt. Xem `ORDER_OWNED_STATUSES`.
 */
export const DEVICE_TRANSITIONS: Record<DeviceStatus, DeviceStatus[]> = {
  IN_STOCK: [DeviceStatus.RESERVED, DeviceStatus.INSPECTING, DeviceStatus.DEFECTIVE],
  // Khách đặt rồi: trả tiền -> SOLD, huỷ đơn/quá hạn -> về kho.
  RESERVED: [DeviceStatus.SOLD, DeviceStatus.IN_STOCK],
  // Hoàn tiền + đã nhận lại hàng -> về kho; khách trả vì máy lỗi -> DEFECTIVE.
  SOLD: [DeviceStatus.IN_STOCK, DeviceStatus.DEFECTIVE],
  INSPECTING: [DeviceStatus.IN_STOCK, DeviceStatus.DEFECTIVE],
  DEFECTIVE: [DeviceStatus.INSPECTING, DeviceStatus.IN_STOCK],
};

/**
 * Trạng thái do **vòng đời đơn hàng** quyết định — API sửa tay không được chạm vào,
 * cả chiều vào lẫn chiều ra.
 *
 * ⚠️ Chiều RA mới là chỗ nguy hiểm thật: chống bán trùng của dự án chỉ dựa vào một
 * điều kiện lúc checkout là `status === IN_STOCK` (khoá dòng rồi kiểm), nó KHÔNG kiểm
 * "máy này có đang thuộc đơn nào còn sống không". Nên nếu cho sửa tay
 * `RESERVED -> IN_STOCK` trong lúc đơn còn treo thì khách thứ hai mua được cùng một
 * máy, và `UNIQUE OrderItem.deviceId` đã bị gỡ nên tầng DB cũng không đỡ.
 * Muốn giải phóng máy thì phải HUỶ ĐƠN (đi qua `cancelInternal`), không sửa cột.
 */
export const ORDER_OWNED_STATUSES: readonly DeviceStatus[] = [
  DeviceStatus.RESERVED,
  DeviceStatus.SOLD,
];

export function isOrderOwnedStatus(s: DeviceStatus): boolean {
  return ORDER_OWNED_STATUSES.includes(s);
}

/**
 * Kiểm một bước chuyển trạng thái máy. Mọi chỗ ĐỔI `Device.status` phải gọi hàm này.
 *
 * @param opts.manual `true` khi bước chuyển do người dùng chỉ định qua API
 *   (`PATCH /devices/:id`, `POST /inventory/:id/export`). Lúc đó ngoài bảng luật còn
 *   chặn thêm `RESERVED`/`SOLD`.
 *
 * Luồng bán hàng (checkout / thanh toán / huỷ đơn) thực thi đúng các cạnh của bảng này
 * bằng điều kiện `WHERE` dưới khoá dòng trong transaction — chặt hơn một lần gọi assert
 * vì nó nguyên tử. Bảng ở đây là nơi phát biểu luật; đừng thêm bước chuyển nào ngoài bảng.
 */
export function assertDeviceTransition(
  from: DeviceStatus,
  to: DeviceStatus,
  opts: { manual?: boolean } = {},
): void {
  if (from === to) return; // không đổi gì thì không phải kiểm

  if (opts.manual && isOrderOwnedStatus(from)) {
    throw new BadRequestException(
      `Máy đang ở trạng thái ${from} do một đơn hàng giữ. Hãy huỷ hoặc hoàn tiền đơn đó, ` +
        'không sửa trực tiếp trạng thái máy.',
    );
  }
  if (opts.manual && isOrderOwnedStatus(to)) {
    throw new BadRequestException(
      `Không thể tự đặt trạng thái ${to}: trạng thái này do đơn hàng quyết định ` +
        '(khách đặt hàng hoặc thanh toán thành công).',
    );
  }
  if (!DEVICE_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(`Không thể chuyển trạng thái máy ${from} -> ${to}`);
  }
}

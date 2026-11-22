import { BadRequestException } from '@nestjs/common';
import { DeviceStatus } from '@prisma/client';
import {
  DEVICE_TRANSITIONS,
  assertDeviceTransition,
  isOrderOwnedStatus,
} from './device-status.util';

const S = DeviceStatus;

describe('assertDeviceTransition — bảng luật', () => {
  it('khai báo đủ 5 trạng thái, không thiếu khoá nào', () => {
    expect(Object.keys(DEVICE_TRANSITIONS).sort()).toEqual(Object.values(S).sort());
  });

  it('cho qua các bước của luồng bán hàng', () => {
    expect(() => assertDeviceTransition(S.IN_STOCK, S.RESERVED)).not.toThrow();
    expect(() => assertDeviceTransition(S.RESERVED, S.SOLD)).not.toThrow();
    expect(() => assertDeviceTransition(S.RESERVED, S.IN_STOCK)).not.toThrow();
    expect(() => assertDeviceTransition(S.SOLD, S.IN_STOCK)).not.toThrow();
  });

  it('chặn bước nhảy cóc / đi ngược vô nghĩa', () => {
    // Bán mà không qua giữ chỗ.
    expect(() => assertDeviceTransition(S.IN_STOCK, S.SOLD)).toThrow(BadRequestException);
    // Đã bán rồi quay lại giữ chỗ.
    expect(() => assertDeviceTransition(S.SOLD, S.RESERVED)).toThrow(BadRequestException);
    // Máy hỏng/đang kiểm định thì không thể bị đặt mua.
    expect(() => assertDeviceTransition(S.DEFECTIVE, S.RESERVED)).toThrow(BadRequestException);
    expect(() => assertDeviceTransition(S.INSPECTING, S.SOLD)).toThrow(BadRequestException);
  });

  it('không đổi gì thì không kiểm (idempotent)', () => {
    for (const s of Object.values(S)) {
      expect(() => assertDeviceTransition(s, s)).not.toThrow();
      expect(() => assertDeviceTransition(s, s, { manual: true })).not.toThrow();
    }
  });
});

describe('assertDeviceTransition — chặn sửa tay (manual)', () => {
  it('không cho tự đặt RESERVED/SOLD', () => {
    expect(() => assertDeviceTransition(S.IN_STOCK, S.RESERVED, { manual: true })).toThrow(
      /do đơn hàng quyết định/,
    );
    expect(() => assertDeviceTransition(S.INSPECTING, S.IN_STOCK, { manual: true })).not.toThrow();
  });

  it('KHÔNG cho tự giải phóng máy đang bị đơn giữ — đây là lỗ hổng bán trùng', () => {
    // Nếu cho sửa tay RESERVED -> IN_STOCK trong lúc đơn còn sống thì khách thứ hai
    // mua được cùng một máy (checkout chỉ kiểm `status === IN_STOCK`).
    expect(() => assertDeviceTransition(S.RESERVED, S.IN_STOCK, { manual: true })).toThrow(
      /huỷ hoặc hoàn tiền/,
    );
    expect(() => assertDeviceTransition(S.SOLD, S.IN_STOCK, { manual: true })).toThrow(
      /huỷ hoặc hoàn tiền/,
    );
    expect(() => assertDeviceTransition(S.SOLD, S.DEFECTIVE, { manual: true })).toThrow(
      /huỷ hoặc hoàn tiền/,
    );
  });

  it('vẫn cho đổi tự do giữa các trạng thái VẬT LÝ', () => {
    expect(() => assertDeviceTransition(S.IN_STOCK, S.INSPECTING, { manual: true })).not.toThrow();
    expect(() => assertDeviceTransition(S.IN_STOCK, S.DEFECTIVE, { manual: true })).not.toThrow();
    expect(() => assertDeviceTransition(S.INSPECTING, S.DEFECTIVE, { manual: true })).not.toThrow();
    expect(() => assertDeviceTransition(S.DEFECTIVE, S.INSPECTING, { manual: true })).not.toThrow();
    expect(() => assertDeviceTransition(S.DEFECTIVE, S.IN_STOCK, { manual: true })).not.toThrow();
  });
});

describe('isOrderOwnedStatus', () => {
  it('đúng 2 trạng thái thuộc vòng đời đơn hàng', () => {
    expect(Object.values(S).filter(isOrderOwnedStatus)).toEqual([S.RESERVED, S.SOLD]);
  });
});

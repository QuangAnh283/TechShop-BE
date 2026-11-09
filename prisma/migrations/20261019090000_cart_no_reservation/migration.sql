-- Giỏ hàng không còn giữ chỗ device trên toàn hệ thống.
-- Trước: CartItem.deviceId UNIQUE toàn cục -> 1 device chỉ nằm được trong đúng 1 giỏ,
--        khách bỏ giỏ rồi đi là máy bị "chôn", không ai mua được nữa (không có TTL/cron dọn).
-- Sau:  nhiều giỏ được cùng chứa 1 device; việc giữ chỗ chỉ xảy ra ở tầng Order
--       (Device -> RESERVED, có SELECT ... FOR UPDATE + unique OrderItem.deviceId bảo vệ).

-- Dọn trùng (cartId, deviceId) nếu có trước khi tạo unique mới (an toàn, bình thường không có).
DELETE FROM "CartItem" a
USING "CartItem" b
WHERE a."cartId" = b."cartId"
  AND a."deviceId" = b."deviceId"
  AND a.ctid > b.ctid;

DROP INDEX IF EXISTS "CartItem_deviceId_key";

CREATE UNIQUE INDEX "CartItem_cartId_deviceId_key" ON "CartItem"("cartId", "deviceId");

CREATE INDEX "CartItem_deviceId_idx" ON "CartItem"("deviceId");

-- Thiết kế lại luồng trade-in (chốt 2026-11-09):
--  * Bỏ trạng thái INSPECTING (gộp kiểm định + báo giá thành 1 bước).
--  * Tách REJECTED -> SHOP_REJECTED (cửa hàng từ chối) + CUSTOMER_DECLINED (khách từ chối giá).
--  * Thêm receivedAt / returnedAt để theo dõi nhận máy & trả máy.
-- Postgres không xóa được giá trị enum tại chỗ -> tái tạo type. An toàn vì bảng đang 0 dòng.

ALTER TYPE "TradeInStatus" RENAME TO "TradeInStatus_old";

CREATE TYPE "TradeInStatus" AS ENUM (
  'PENDING',
  'RECEIVED',
  'OFFERED',
  'ACCEPTED',
  'COMPLETED',
  'SHOP_REJECTED',
  'CUSTOMER_DECLINED'
);

ALTER TABLE "TradeInRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TradeInRequest"
  ALTER COLUMN "status" TYPE "TradeInStatus" USING ("status"::text::"TradeInStatus");
ALTER TABLE "TradeInRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "TradeInStatus_old";

ALTER TABLE "TradeInRequest" ADD COLUMN "receivedAt" TIMESTAMP(3);
ALTER TABLE "TradeInRequest" ADD COLUMN "returnedAt" TIMESTAMP(3);

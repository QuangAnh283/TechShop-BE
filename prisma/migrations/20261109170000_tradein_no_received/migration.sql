-- Thu cũ: bỏ trạng thái RECEIVED và hai mốc receivedAt/returnedAt.
--
-- Nghiệp vụ đã chốt: khách KHÔNG gửi máy đi trước. Kỹ thuật viên xem yêu cầu trên hệ
-- thống rồi báo giá; chỉ khi hai bên chốt giá (ACCEPTED) khách mới mang máy tới cơ sở
-- và giao dịch trực tiếp. Vậy cửa hàng không bao giờ giữ máy của khách ở giai đoạn
-- chờ -> không có "đã nhận máy", cũng không có "trả máy lại".
--
-- Vòng đời còn lại:
--   PENDING → OFFERED (báo giá lại) → ACCEPTED → COMPLETED
--   PENDING → ACCEPTED  (KTV đồng ý luôn giá ước tính)
--   nhánh hỏng: SHOP_REJECTED / CUSTOMER_DECLINED

-- Đưa các bản ghi đang RECEIVED về PENDING: chúng mới chỉ được tiếp nhận, chưa báo giá.
-- Phải chạy TRƯỚC khi tạo lại kiểu enum, lúc 'RECEIVED' còn hợp lệ.
UPDATE "TradeInRequest" SET "status" = 'PENDING' WHERE "status" = 'RECEIVED';

-- Postgres không xoá được giá trị khỏi enum đang dùng -> tạo kiểu mới rồi chuyển cột sang.
ALTER TYPE "TradeInStatus" RENAME TO "TradeInStatus_old";

CREATE TYPE "TradeInStatus" AS ENUM (
  'PENDING',
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

ALTER TABLE "TradeInRequest" DROP COLUMN IF EXISTS "receivedAt";
ALTER TABLE "TradeInRequest" DROP COLUMN IF EXISTS "returnedAt";

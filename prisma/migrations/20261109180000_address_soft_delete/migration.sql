-- Địa chỉ giao hàng chuyển sang XOÁ MỀM.
--
-- Vì sao: "Order"."addressId" là khoá ngoại ON DELETE SET NULL. Khách xoá một địa chỉ khỏi
-- sổ địa chỉ là MỌI đơn hàng cũ từng giao tới đó bị set NULL — đơn mất hẳn thông tin nơi
-- giao, trang chi tiết đơn hiện trống. Đã xảy ra thật trên DB demo: 3 đơn mất địa chỉ.
--
-- Giống quy ước đã dùng cho User/Product/Device/PermissionGroup: đánh dấu deletedAt,
-- lọc khỏi danh sách, nhưng bản ghi vẫn còn để lịch sử tham chiếu được.
ALTER TABLE "Address" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

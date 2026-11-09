-- Gỡ ràng buộc UNIQUE toàn cục trên OrderItem."deviceId".
--
-- Lý do: ràng buộc này là VĨNH VIỄN, trong khi huỷ đơn (hoặc cron tự huỷ đơn VNPay
-- quá hạn) lại trả máy về IN_STOCK để bán tiếp. Kết quả: máy hiện ra là mua được
-- nhưng vừa bấm đặt hàng là vỡ P2002 "vi phạm ràng buộc duy nhất".
--
-- Chống bán trùng KHÔNG mất đi: nó vốn được bảo đảm ở tầng giao dịch trong
-- `orders.createFromCart` — khoá dòng Device bằng `SELECT ... FOR UPDATE ... ORDER BY d.id`
-- rồi kiểm `status = IN_STOCK`. Hai người mua song song thì người sau bị khoá chờ,
-- đọc lại thấy RESERVED và nhận 409. Ràng buộc unique chỉ là lớp phòng thủ phụ,
-- và cái giá của nó là không bao giờ bán lại được máy của đơn đã huỷ.
DROP INDEX IF EXISTS "OrderItem_deviceId_key";

-- Giữ index thường để tra cứu theo deviceId (vd kiểm tra đã mua hàng chưa khi viết đánh giá).
CREATE INDEX IF NOT EXISTS "OrderItem_deviceId_idx" ON "OrderItem"("deviceId");

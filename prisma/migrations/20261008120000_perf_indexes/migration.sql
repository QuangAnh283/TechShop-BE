-- PHASE 18: index tối ưu hiệu năng tìm kiếm & liệt kê.

-- Tăng tốc tìm kiếm ILIKE theo tên sản phẩm (products.findAll ?search=, filter)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx" ON "Product" USING GIN ("name" gin_trgm_ops);

-- Hỗ trợ sort/liệt kê đơn hàng theo thời gian
CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order" ("createdAt");

-- Hỗ trợ truy vấn thiết bị theo (product, trạng thái) khi dựng trang chi tiết
CREATE INDEX IF NOT EXISTS "Device_product_status_idx" ON "Device" ("productId", "status");

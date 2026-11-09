# TechShop Backend

Backend cho **TechShop** — website TMĐT thiết bị điện tử cũ & thu cũ đổi mới.
Giai đoạn hiện tại: **PHASE 1 — Database** (Prisma schema + migration + seed).
NestJS sẽ được thêm ở PHASE 2.

## Công nghệ
- PostgreSQL (native, cổng 5432)
- Redis (native, cổng 6379) — cache + session refresh-token
- Prisma ORM
- TypeScript

## Yêu cầu
- Node.js 20+
- PostgreSQL native (có sẵn `psql`/`pg_dump` trên PATH) — cho `db:seed`/`db:dump`
- Redis native (Memurai hoặc Redis trên WSL)

## Dựng database (lần đầu)

```bash
# 1) Tạo role + database trên PostgreSQL native (chạy bằng superuser, 1 lần)
#    datn CẦN SUPERUSER: db:seed nạp seed.sql có --disable-triggers (tắt kiểm FK),
#    thao tác này đòi quyền superuser. (Trong Docker cũ datn vốn là superuser.)
psql -U postgres -c "CREATE ROLE datn LOGIN SUPERUSER PASSWORD 'datn';"
psql -U postgres -c "CREATE DATABASE datn OWNER datn;"

# 2) Cài dependencies
cd backend
cp .env.example .env     # chỉnh DATABASE_URL nếu cần (mặc định cổng 5432)
npm install

# 3) Tạo schema từ migration
npx prisma migrate deploy   # hoặc: npx prisma migrate dev

# 4) Nạp dữ liệu demo
npm run db:seed             # nạp prisma/seed.sql qua psql local
```

Mở Prisma Studio để xem dữ liệu: `npm run prisma:studio`.

## Chạy backend (NestJS)

```bash
npm run start:dev     # dev, watch mode
# hoặc
npm run build && npm run start:prod
```

- API chạy ở `http://localhost:3001` (cổng 3001 vì 3000 bị service khác chiếm — đổi ở `.env`).
- Kiểm tra: `GET /` (info) và `GET /health` (xác nhận kết nối DB).

## Tài khoản demo
| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | admin@techshop.local | Admin@123 |
| Kỹ thuật viên | tech@techshop.local | Tech@123 |
| Khách hàng | customer@techshop.local | Customer@123 |

## Dữ liệu demo — nguồn gốc (để giải thích khi bảo vệ)
- **Catalog** (Category, Brand, Product, ProductImage, ProductSpec) được thu thập từ
  nguồn công khai (hoanghamobile.com) cho mục đích học tập: 6 danh mục, 150 sản phẩm.
  Ảnh đã tải về `backend/uploads/products/`.
- **Device** (máy vật lý) là **synthetic** — sinh tự động từ mỗi Product: Serial/IMEI
  duy nhất, tình trạng (LIKE_NEW/EXCELLENT/GOOD/FAIR), độ chai pin, giá bán hàng cũ
  tính theo tỉ lệ so với giá máy mới, trạng thái kho. IMEI thật KHÔNG được crawl (nhạy cảm).
- Công cụ crawl đã được gỡ khỏi repo sau khi sinh `seed.sql`. Dữ liệu demo nay nằm
  trọn trong `prisma/seed.sql` (data-only, ~2500 INSERT) — độc lập, import lại được.

## Các lệnh
| Lệnh | Tác dụng |
|---|---|
| `npm run prisma:generate` | Sinh Prisma Client |
| `npm run prisma:migrate` | Tạo/áp dụng migration (dev) |
| `npm run prisma:studio` | Xem/sửa dữ liệu bằng GUI |
| `npm run db:seed` | Nạp dữ liệu demo từ `prisma/seed.sql` |
| `npm run db:dump` | Xuất lại `prisma/seed.sql` từ DB hiện tại |

## API (PHASE 2 → 11 đã hoàn thành)

Base URL: `http://localhost:3001/api/v1` · Swagger: `http://localhost:3001/api/docs`

Response chuẩn: `{ success, statusCode, data, (meta), timestamp, path }`; lỗi: `{ success:false, statusCode, message, error, ... }`.

| Nhóm | Endpoint tiêu biểu | Quyền |
|---|---|---|
| auth | `POST /auth/register\|login\|refresh\|logout\|forgot-password\|verify-otp\|reset-password\|resend-verification`, `GET /auth/verify-email?token=` | public |
| users | `GET/PATCH /users/me`, `POST /users/me/change-password` | đăng nhập |
| categories | `GET /categories[/:idOrSlug]`; `POST/PATCH/DELETE` | đọc public / ghi ADMIN |
| brands | tương tự categories | đọc public / ghi ADMIN |
| products | `GET /products` (lọc+phân trang), `GET /products/:idOrSlug`; `POST/PATCH/DELETE`, `PUT /:id/specs` | đọc public / ghi ADMIN |
| addresses | `GET/POST /addresses`, `PATCH /:id`, `PATCH /:id/default`, `DELETE /:id` | đăng nhập |
| reviews | `GET /reviews?productId=`; `POST /reviews` (đã mua mới được); `DELETE /:id` | đọc public / ghi đăng nhập |
| search | `GET /search?q=&category=&brandId=&minPrice=&maxPrice=&condition=&ram=&storage=&sort=` (PostgreSQL FTS) | public |
| devices | `GET/POST/PATCH/DELETE /devices`, `PUT /:id/warranty`, `GET\|POST /:id/repairs` | ADMIN/TECHNICIAN |
| inventory | `GET /inventory/summary`, `POST /inventory/import`, `POST /:deviceId/export`, `GET /:deviceId/history`, warehouses | ADMIN/TECHNICIAN |
| cart | `GET /cart`, `POST /cart/items`, `DELETE /cart/items/:deviceId`, `DELETE /cart`, `GET /cart/validate` | đăng nhập |
| orders | `POST /orders/checkout` (paymentMethod VNPAY\|COD), `GET /orders`, `GET /orders/all` (ADMIN), `GET /:id`, `PATCH /:id/status` (ADMIN), `PATCH /:id/cancel` | đăng nhập |
| payments | `POST /payments/:orderId/vnpay/create`, `GET /payments/vnpay/return\|ipn` | create: đăng nhập |
| trade-in | `GET /trade-in/questions`, `POST /trade-in/estimate`, `POST /trade-in/requests`, `GET /trade-in/requests[/:id]`, `POST /:id/accept\|reject` | estimate public, còn lại đăng nhập |
| trade-in/manage | `POST/DELETE questions`, `PUT rules`, `GET requests`, `PATCH /:id/assign\|status`, `POST /:id/inspect` | ADMIN/TECHNICIAN |
| admin | `GET /admin/dashboard`, `GET /admin/reports/revenue` | quyền `report.read` |
| admin/users | `GET /admin/users`, `POST /admin/users` (tạo nhân sự), `PATCH /:id/role`, `PATCH /:id/status` | ADMIN |
| admin/phân quyền | `GET /admin/permissions` (danh mục mã quyền), `GET/POST/PATCH/DELETE /admin/permission-groups`, `PUT /admin/users/:id/group` | ADMIN |

> Từ 2026-10-20, cột "Quyền" của nhóm nghiệp vụ là **mã quyền** chứ không phải vai trò: nhân viên
> thuộc một `PermissionGroup` do admin tự tạo trên `/admin/permissions`. ADMIN luôn có mọi quyền.

Điểm nhấn kỹ thuật (để bảo vệ đồ án):
- **Chống bán trùng device**: checkout dùng `SELECT ... FOR UPDATE ... ORDER BY d.id` khóa hàng trong
  transaction + ràng buộc unique `OrderItem.deviceId` ở DB (2 lớp). Đã test 2 checkout đồng thời → đúng 1
  thành công. `ORDER BY` để 2 đơn có device trùng nhau không khóa ngược chiều gây deadlock.
- **Giỏ hàng KHÔNG giữ chỗ**: nhiều khách được cùng để 1 device trong giỏ (`@@unique([cartId, deviceId])`),
  ai checkout trước thì thắng; giữ chỗ chỉ xảy ra ở tầng Order (`RESERVED`). Trước đây `CartItem.deviceId`
  unique toàn cục khiến khách bỏ giỏ rồi đi là máy bị "chôn", không ai mua được nữa.
- **Trade-in pricing engine** tách khỏi controller: `estimatedPrice = basePrice + Σ điều chỉnh option`.
- **VNPay**: ký & verify HMAC SHA512 phía server, không tin dữ liệu client.
- **FTS**: PostgreSQL full-text search (`to_tsvector`) qua Prisma preview `fullTextSearchPostgres`.
- **Vòng đời bán**: checkout → device `RESERVED`; thanh toán (VNPay) hoặc admin xác nhận (COD) → `SOLD`; hủy/hết hạn → `IN_STOCK`. Đơn VNPay quá hạn tự hủy (cron).
- **COD vs VNPAY**: COD admin xác nhận, thu tiền khi `DELIVERED`; VNPay xác nhận qua callback idempotent —
  admin **không** xác nhận tay được đơn VNPay chưa thanh toán (nếu không đơn đi tới `DELIVERED` mà payment
  kẹt `PENDING`). Cron tự hủy khóa `Payment FOR UPDATE` và bỏ qua đơn vừa được thanh toán.
- **Trade-in khép kín**: ước giá → yêu cầu (bắt buộc trả lời đủ câu hỏi + nhập IMEI) → kỹ thuật viên kiểm định/chốt giá → khách đồng ý → `COMPLETED` tự **nhập máy vào kho** thành Device bán lại (admin nhập tay được IMEI/giá thu/giá bán; bỏ trống thì giá bán = giá thu +20%). Bước này khóa dòng + idempotent nên bấm hai lần không nhập kho hai lần.

## Xác thực email khi đăng ký (Gmail SMTP)
- Đăng ký → tài khoản `INACTIVE`, hệ thống gửi email chứa link `GET /auth/verify-email?token=...`.
- Bấm link → tài khoản `ACTIVE` + `emailVerified=true`, đăng nhập được. Login trước xác thực → 401.
- Gửi lại: `POST /auth/resend-verification { email }`.
- Cấu hình trong `.env`: `MAIL_USER` = địa chỉ Gmail gửi, `MAIL_PASS` = Gmail **App Password** (16 ký tự).
  Khi `MAIL_USER` để trống → chạy **log-only** (in link ra log, không gửi thật) để dev/test.
- Lấy App Password: Google Account → Security → 2-Step Verification → App passwords.

## Testing (PHASE 16)
```bash
npm test            # unit test (Jest) — 42 test: pricing, order transitions, cart, auth, vnpay, slug
npm run test:cov    # kèm coverage
bash test/smoke.sh       # integration + race-condition (cần server đang chạy + DB đã seed)
bash test/smoke-authz.sh # ma trận phân quyền 3 vai trò (27 ca)
```
- Postman collection: `postman/TechShop.postman_collection.json` (chạy "Auth > Login (admin)" trước để tự lưu token).

## Phân quyền (2026-10-20)
Hai tầng: **vai trò** (`ADMIN | TECHNICIAN | CUSTOMER` — `TECHNICIAN` = "Nhân viên") quyết định vào được
khu nào; **nhóm quyền** trong DB quyết định bấm được nút nào. Admin tạo/sửa nhóm trên giao diện, không
cần sửa code. Mã quyền khai báo ở `src/common/authz/permissions.ts`; 5 nhóm preset được tạo tự động lúc
khởi động (`permissions.bootstrap.ts`, upsert idempotent).

Điểm nhấn kỹ thuật:
- **Quyền giải tươi mỗi request** (Redis `authz:user:<id>` TTL 300s → DB), **không nhét vào JWT**: khóa
  tài khoản / đổi vai trò / gỡ quyền có hiệu lực ngay, không phải chờ access token hết hạn.
- Trước đây `refresh()` cấp lại token bằng vai trò trong token cũ và không kiểm `status` → người bị khóa
  giữ quyền vô thời hạn. Nay đọc lại từ DB và thu hồi sạch phiên.
- Chặn sửa giá ở **mức field** trong 4 service (guard chỉ chặn được theo endpoint).
- `user.manage` / `permission.manage` / `audit.read` **cấm gán vào nhóm** — chống leo thang đặc quyền.
- Rào an toàn: không tự đổi vai trò/tự khóa mình, không hạ quyền hay khóa **quản trị viên cuối cùng**.

```bash
bash test/smoke-authz.sh   # 27 ca kiểm thử ma trận quyền (cần server chạy)
```

## Security (PHASE 17)
- `helmet` (security headers), CORS allowlist qua `CORS_ORIGIN`, rate-limit toàn cục 120/phút + **10/phút cho nhóm /auth** (chống brute-force).
- Mật khẩu bcrypt, JWT access+refresh (refresh rotation), validation toàn cục (whitelist), Prisma tham số hóa (chống SQL injection), lỗi 5xx không lộ stack.
- Cảnh báo khi production còn dùng JWT secret mặc định.

## Triển khai
Chạy native, không dùng Docker. Đảm bảo PostgreSQL (5432) + Redis (6379) đang chạy,
rồi:
```bash
npm run build && npm run start:prod   # backend :3001
```
Frontend: `cd ../frontend && npm run build && npm start` (:3002).

## Hiệu năng (PHASE 18)
- Index: `pg_trgm` GIN trên `Product.name` (tăng tốc tìm ILIKE), index `Order.createdAt`, `Device(productId,status)`.
- List dùng `include` (tránh N+1), phân trang mọi nơi. FTS qua PostgreSQL `to_tsvector`.

## Ghi chú
- Giá tiền lưu kiểu `Int` theo đơn vị VNĐ.
- Phân biệt **Product** (model/SKU) vs **Device** (máy vật lý, stock = 1).
- Tiến độ & lộ trình tổng thể: `../PROGRESS.md`.

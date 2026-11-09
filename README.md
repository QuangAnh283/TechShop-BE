# TechShop — Backend

API cho **TechShop**, website thương mại điện tử bán **thiết bị điện tử cũ / refurbished**
(điện thoại, laptop, tablet, PC, màn hình, smartwatch) kèm nghiệp vụ **thu cũ đổi mới (trade-in)**.

> **Frontend nằm ở repo riêng:** https://github.com/QuangAnh283/TechShop-FE
> Muốn xem được giao diện thì phải chạy cả hai. Hãy chạy backend trước (frontend gọi về `:3001`).

---

## 1. Công nghệ sử dụng

| Lớp | Công nghệ | Phiên bản | Vai trò trong dự án |
|---|---|---|---|
| Ngôn ngữ | **TypeScript** | 5.7 | Toàn bộ source |
| Runtime | **Node.js** | **20 LTS+** | |
| Framework | **NestJS** | 11 | Kiến trúc module, DI, guard/interceptor/filter |
| ORM | **Prisma** | 6.2 | Schema-first, migration, truy vấn type-safe |
| Database | **PostgreSQL** | **17+** (test trên 18.6) | Dữ liệu + full-text search + transaction khóa dòng |
| Xác thực | **Passport-JWT** + `@nestjs/jwt` | 11 | Access token + refresh token (có rotation) |
| Mật khẩu | **bcryptjs** | 2.4 | Hash mật khẩu |
| Validation | **class-validator** / **class-transformer** | 0.14 / 0.5 | `ValidationPipe` toàn cục, whitelist DTO |
| Cấu hình | **@nestjs/config** + **Joi** | 4.0 / 17 | Đọc & validate biến môi trường lúc khởi động |
| Tài liệu API | **Swagger** (`@nestjs/swagger`) | 11 | `/api/docs` |
| Bảo mật | **helmet**, **@nestjs/throttler** | 8.0 / 6.4 | Security header, rate limit |
| Email | **nodemailer** | 6.9 | Gửi mail xác thực đăng ký / OTP đặt lại mật khẩu (Gmail SMTP) |
| Upload | **multer** + **image-size** | 2.x | Nhận ảnh, lưu đĩa local `uploads/` |
| Hẹn giờ | **@nestjs/schedule** | 5.0 | Cron tự huỷ đơn quá hạn, dọn refresh-token hết hạn |
| Thanh toán | **VNPay** (sandbox) | — | Ký/verify HMAC SHA512 phía server |
| Cache | **trong bộ nhớ tiến trình** (`src/cache/`) | — | **Không dùng Redis** |
| Test | **Jest** + **ts-jest**, **supertest** | 29 | 57 unit test / 8 suite |
| Chất lượng | **ESLint** + **Prettier** | 8.57 / 3.4 | `npm run lint` |

**Hạ tầng duy nhất phải cài là PostgreSQL.** Không Docker, không Redis, không message queue.

---

## 2. Yêu cầu máy

| Phần mềm | Phiên bản | Kiểm tra |
|---|---|---|
| **Node.js** | 20 LTS trở lên | `node -v` |
| **PostgreSQL** | **17 trở lên** | `psql --version` |

`psql` và `pg_dump` **phải có trong PATH** — hai script `db:seed` / `db:dump` gọi trực tiếp hai
lệnh này.

<details>
<summary><b>Windows: thêm psql vào PATH</b></summary>

Thêm `C:\Program Files\PostgreSQL\18\bin` (đổi `18` theo bản bạn cài) vào biến môi trường `Path`,
rồi **mở terminal mới** và kiểm tra `psql --version`. Thiếu bước này thì `npm run db:seed` báo
không tìm thấy `psql`.
</details>

**Vì sao cần PostgreSQL 17+:** `prisma/seed.sql` được sinh bằng `pg_dump` 18, trong file có
`SET transaction_timeout` (chỉ có từ PG 17) và lệnh `\restrict` của psql mới. Bản cũ hơn sẽ báo lỗi
khi nạp — cách xử lý ở [mục 9](#9-gặp-lỗi-tra-ở-đây-trước).

---

## 3. Cài đặt & chạy

### Bước 1 — Tạo database (làm một lần)

Chạy bằng superuser của PostgreSQL (mặc định là user `postgres`, sẽ bị hỏi mật khẩu đặt lúc cài):

```bash
psql -U postgres -c "CREATE ROLE datn LOGIN SUPERUSER PASSWORD 'datn';"
psql -U postgres -c "CREATE DATABASE datn OWNER datn;"
```

> **Vì sao role `datn` cần `SUPERUSER`?** File dữ liệu demo `prisma/seed.sql` được `pg_dump` sinh
> ra với cờ `--disable-triggers` (tạm tắt kiểm tra khóa ngoại để nạp không phụ thuộc thứ tự bảng).
> Thao tác đó đòi quyền superuser. Bỏ `SUPERUSER` thì `db:seed` báo
> `permission denied: "RI_ConstraintTrigger_..." is a system trigger`. Đây là DB localhost cho mục
> đích demo nên cấp superuser là chấp nhận được.

### Bước 2 — Cài & nạp dữ liệu

```bash
git clone https://github.com/QuangAnh283/TechShop-BE.git
cd TechShop-BE

cp .env.example .env         # PowerShell: Copy-Item .env.example .env
npm install                  # tự chạy `prisma generate` (script postinstall)
npm run db:setup             # = prisma migrate deploy + db:seed
```

`db:setup` áp 13 migration rồi nạp dữ liệu demo. Muốn làm từng bước:
`npx prisma migrate deploy` rồi `npm run db:seed`.

### Bước 3 — Chạy

```bash
npm run start:dev                      # dev, watch mode
# hoặc bản production:
npm run build && npm run start:prod
```

API ở **http://localhost:3001** · Swagger **http://localhost:3001/api/docs**

Kiểm tra sống:

```bash
curl http://localhost:3001/api/v1/health
# {"success":true,...,"data":{"status":"ok","db":"up",...}}
```

> ⚠️ Mọi route đều nằm dưới prefix `/api` + version `v1`. Gọi `http://localhost:3001/health`
> (không có `/api/v1`) trả **404** — đó là đúng thiết kế, không phải lỗi.

### Bước 4 — Chạy frontend

Xem hướng dẫn ở repo https://github.com/QuangAnh283/TechShop-FE (mở terminal thứ hai, cổng 3002).

---

## 4. Biến môi trường

Chạy demo localhost thì **không cần sửa gì** trong `.env` — mọi biến đều có giá trị mặc định dùng
được. Các biến đáng chú ý:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3001` | Cổng API |
| `DATABASE_URL` | `postgresql://datn:datn@localhost:5432/datn` | Sửa nếu đặt user/mật khẩu/cổng khác |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `change-me` | **Phải đổi thành chuỗi ngẫu nhiên** nếu đưa lên môi trường thật. App cảnh báo nếu production còn giá trị mặc định |
| `JWT_ACCESS_EXPIRES` / `JWT_REFRESH_EXPIRES` | `15m` / `7d` | Hạn token |
| `MAIL_USER` / `MAIL_PASS` | rỗng | Gmail + **app password 16 ký tự**. **Để rỗng thì app vẫn chạy bình thường**, chỉ in link xác thực ra log thay vì gửi mail thật |
| `VNPAY_TMN_CODE` / `VNPAY_HASH_SECRET` | placeholder | Đăng ký ở [sandbox.vnpayment.vn](https://sandbox.vnpayment.vn) nếu muốn thanh toán thử |
| `VNPAY_URL` | `.../paymentv2/vpcpay.html` | **Đúng phải là `vpcpay.html`**; `vnpay.html` sẽ 404 |
| `UPLOADS_DIR` | `uploads` | Nơi lưu ảnh upload |
| `MEDIA_MAX_SIZE_MB` | `5` | Giới hạn dung lượng mỗi ảnh |
| `SHIPPING_FEE` / `SHIPPING_FREE_THRESHOLD` | `30000` / `10000000` | Phí ship 30.000₫, miễn phí khi tiền hàng ≥ 10 triệu |
| `ORDER_PENDING_TTL_MINUTES` | `30` | Đơn VNPay chưa thanh toán quá 30 phút bị cron tự huỷ, máy hoàn về kho |
| `CORS_ORIGIN` | `http://localhost:3002` | Allowlist CORS |

> ⚠️ Sửa `.env` xong **phải khởi động lại backend** — chế độ watch của NestJS không nạp lại `.env`.
>
> 🔒 File `.env` đã được `.gitignore`. **Đừng commit nó** — chỉ commit `.env.example`.

---

## 5. Tài khoản demo

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Quản trị viên | `admin@techshop.local` | `Admin@123` |
| Nhân viên (kỹ thuật viên) | `tech@techshop.local` | `Tech@123` |
| Khách hàng | `customer@techshop.local` | `Customer@123` |

Dữ liệu demo kèm theo: 6 danh mục · 150 sản phẩm · 306 máy trong kho · 299 ảnh · 5 nhóm quyền ·
149 quy tắc giá thu cũ · 4 đơn hàng mẫu.

> **Dashboard quản trị hiển thị doanh thu 0₫ — đó là đúng dữ liệu, không phải lỗi.** Cả 4 đơn mẫu
> đều ở trạng thái `CANCELLED`: ba đơn có thanh toán `FAILED`, một đơn đã thanh toán qua VNPay
> sandbox rồi được hoàn tiền (`REFUNDED`). `totalRevenue` chỉ cộng các `Payment` có trạng thái
> `PAID` nên kết quả bằng 0, và báo cáo doanh thu theo ngày cũng trống. Muốn thấy số liệu thì tự
> đặt vài đơn rồi xác nhận thanh toán.
>
> Đơn VNPay đã hoàn tiền giữ lại `providerData` thật của cổng thanh toán (mã phản hồi `00`, ngân
> hàng `NCB`) để minh họa một callback thành công, nhưng **`vnp_TmnCode` và `vnp_SecureHash` đã
> được thay bằng giá trị giả** — đó là credential của merchant sandbox, không đưa lên repo công khai.

> **Lưu ý:** admin và nhân viên **không xem được trang mua hàng** — đăng nhập hai tài khoản này sẽ
> bị chuyển về `/admin`. Đây là thiết kế có chủ ý.

### Nguồn gốc dữ liệu demo

- **Catalog** (danh mục, thương hiệu, sản phẩm, ảnh, thông số) thu thập từ nguồn công khai
  (hoanghamobile.com) cho mục đích học tập. Ảnh đã tải về `uploads/`.
- **Device** (máy vật lý) là **dữ liệu tổng hợp** — sinh tự động từ mỗi sản phẩm: serial/IMEI duy
  nhất, tình trạng (`LIKE_NEW`/`EXCELLENT`/`GOOD`/`FAIR`), độ chai pin, giá bán hàng cũ tính theo
  tỉ lệ so với giá máy mới. **IMEI thật không được thu thập** (dữ liệu nhạy cảm).
- Công cụ crawl đã gỡ khỏi repo sau khi sinh `seed.sql`. Dữ liệu demo nay nằm trọn trong
  `prisma/seed.sql` (data-only, ~2500 INSERT) — độc lập, nạp lại được bất cứ lúc nào.

---

## 6. Các lệnh

| Lệnh | Tác dụng |
|---|---|
| `npm run start:dev` | Chạy watch mode |
| `npm run build && npm run start:prod` | Bản production |
| `npm test` | 57 unit test (Jest) |
| `npm run test:cov` | Unit test + coverage |
| `npm run lint` | ESLint (có `--fix`) |
| `npm run db:setup` | `migrate deploy` + `db:seed` |
| `npm run db:seed` | Nạp dữ liệu demo từ `prisma/seed.sql` |
| `npm run db:dump` | Xuất lại `prisma/seed.sql` từ DB hiện tại |
| `npm run prisma:studio` | GUI xem/sửa dữ liệu |
| `npm run prisma:migrate` | Tạo migration mới (dev) |
| `bash test/smoke.sh` | Integration + kiểm thử tranh chấp (cần server đang chạy) |
| `bash test/smoke-authz.sh` | Ma trận phân quyền 3 vai trò (27 ca) |

Reset database về đúng dữ liệu demo ban đầu:

```bash
npx prisma migrate reset --force --skip-seed && npm run db:seed
```

Sau khi đổi schema hoặc dữ liệu demo, nhớ `npm run db:dump` để `seed.sql` khớp lại.

---

## 7. Kiến trúc

```
src/
├── main.ts            # Dựng toàn bộ cross-cutting concern — ĐỌC FILE NÀY TRƯỚC
├── config/            # configuration.ts (typed) + env.validation.ts (Joi)
├── prisma/            # PrismaService (@Global)
├── cache/             # CacheService (@Global) — cache trong RAM, thay Redis
├── common/            # guard, decorator, interceptor, filter, util, mã quyền
└── modules/           # 18 module nghiệp vụ
    ├── auth/  users/  addresses/
    ├── categories/  brands/  products/  reviews/  search/  media/
    ├── devices/  inventory/
    ├── cart/  orders/  payments/
    ├── trade-in/
    └── admin/  permissions/  audit/  mail/
```

**Modular + service/repository** (không Clean Architecture). Mỗi module gồm
`*.controller.ts` + `*.service.ts` + `*.module.ts` + `dto/`. Service gọi thẳng `PrismaService`,
không có tầng repository riêng.

`main.ts` dựng: global prefix `/api` + URI versioning (`v1`), `ValidationPipe`
(whitelist + `forbidNonWhitelisted`), `TransformInterceptor`, `AllExceptionsFilter`, helmet, CORS
allowlist, static serve `uploads/` tại `/uploads`, Swagger.

**Mọi response thành công** được bọc thành:

```json
{ "success": true, "statusCode": 200, "data": ..., "meta": {...}, "timestamp": "...", "path": "..." }
```

Lỗi: `{ "success": false, "statusCode": 400, "message": "...", "error": "..." }`.

---

## 8. API

Base URL `http://localhost:3001/api/v1` · Swagger `http://localhost:3001/api/docs`

| Nhóm | Endpoint tiêu biểu | Quyền |
|---|---|---|
| auth | `POST /auth/register\|login\|refresh\|logout\|forgot-password\|verify-otp\|reset-password\|resend-verification`, `GET /auth/verify-email?token=` | public |
| users | `GET/PATCH /users/me`, `POST /users/me/change-password` | đăng nhập |
| categories | `GET /categories[/:idOrSlug]`; `POST/PATCH/DELETE` | đọc public / ghi `category.manage` |
| brands | tương tự categories | đọc public / ghi `brand.manage` |
| products | `GET /products` (lọc + phân trang + sắp xếp), `GET /products/:idOrSlug`; `POST/PATCH/DELETE`, `PUT /:id/specs` | đọc public / ghi `product.manage` |
| search | `GET /search?q=&category=&brandId=&minPrice=&maxPrice=&condition=&ram=&storage=&sort=` | public |
| reviews | `GET /reviews?productId=`; `POST /reviews` (phải đã mua); `DELETE /:id` | đọc public / ghi đăng nhập |
| addresses | `GET/POST /addresses`, `PATCH /:id`, `PATCH /:id/default`, `DELETE /:id` | đăng nhập |
| cart | `GET /cart`, `POST /cart/items`, `DELETE /cart/items/:deviceId`, `DELETE /cart`, `GET /cart/validate` | đăng nhập |
| orders | `POST /orders/checkout` (`VNPAY`\|`COD`), `GET /orders`, `GET /orders/all`, `GET /:id`, `PATCH /:id/status`, `PATCH /:id/cancel`, `POST /:id/refund` | khách: đơn của mình · quản trị: `order.manage` / `order.refund` |
| payments | `POST /payments/:orderId/vnpay/create`, `GET /payments/vnpay/return\|ipn` | create: đăng nhập · callback: public (verify HMAC) |
| devices | `GET/POST/PATCH/DELETE /devices`, `PUT /:id/warranty`, `GET\|POST /:id/repairs` | `device.manage`, giá cần `price.update` |
| inventory | `GET /inventory/summary`, `POST /inventory/import`, `POST /:deviceId/export`, `GET /:deviceId/history`, warehouses | `inventory.manage` (+ `price.update` khi nhập kho) |
| trade-in | `GET /trade-in/questions\|products`, `POST /trade-in/estimate`, `POST /trade-in/requests`, `GET /trade-in/requests[/:id]`, `POST /:id/accept\|reject` | estimate public · còn lại đăng nhập |
| trade-in/manage | `POST /questions`, `DELETE /questions/:id`, `PUT /rules`, `GET /requests`, `PATCH /:id/assign\|status`, `POST /:id/inspect` | `tradein.manage` / `tradein.complete` |
| media | `POST /media` (upload ảnh), `DELETE /media/:id` | `product.manage` |
| admin | `GET /admin/dashboard`, `GET /admin/reports/revenue` | `report.read` |
| admin/users | `GET/POST /admin/users`, `PATCH /:id/role`, `PATCH /:id/status` | ADMIN (`user.manage`) |
| admin/phân quyền | `GET /admin/permissions`, `GET/POST/PATCH/DELETE /admin/permission-groups`, `PUT /admin/users/:id/group` | ADMIN (`permission.manage`) |
| admin/nhật ký | `GET /admin/audit`, `GET /admin/audit/actions` | ADMIN (`audit.read`) |

---

## 9. Phân quyền — hai tầng

**Tầng thô — vai trò.** `UserRole = ADMIN | TECHNICIAN | CUSTOMER` quyết định *vào được khu nào*.
`TECHNICIAN` nghĩa là **nhân viên nói chung** (nhãn hiển thị ở giao diện là "Nhân viên").

**Tầng tinh — nhóm quyền.** Nhân viên thuộc **đúng một** `PermissionGroup` trong DB; nhóm chứa
mảng mã quyền, quyết định *bấm được nút nào*. Admin tạo/sửa nhóm trên giao diện `/admin/permissions`
**không cần sửa code**.

26 mã quyền khai báo ở [`src/common/authz/permissions.ts`](src/common/authz/permissions.ts) — **trong
code chứ không trong DB**, vì một mã quyền chỉ có nghĩa khi có endpoint tương ứng. Thứ admin tạo lúc
chạy là *nhóm*, nên chỉ nhóm nằm trong DB. 41 handler được gắn `@RequirePermissions`. 5 nhóm preset
được tạo tự động lúc khởi động (`permissions.bootstrap.ts`, upsert idempotent).

Điểm nhấn kỹ thuật:

- **Quyền được giải tươi ở mỗi request** (đọc thẳng DB, **không cache, không nhét vào JWT**). Nhờ
  vậy khoá tài khoản / đổi vai trò / gỡ quyền có hiệu lực **ngay ở request kế tiếp**, thay vì phải
  chờ access token hết hạn. Nhét quyền vào JWT chính là lỗ hổng "token mang quyền cũ" đã phải vá.
- Ba mã `user.manage`, `permission.manage`, `audit.read` **bị cấm gán vào nhóm** — nếu không, nhân
  viên có `permission.manage` sẽ tự nâng mình thành toàn quyền.
- Guard chỉ chặn được theo endpoint, nên chặn **ở mức field** (ví dụ sửa được thiết bị nhưng không
  sửa được giá) làm trong service bằng `can(user, PERM.PRICE_UPDATE)` — áp ở 5 chỗ.
- Rào an toàn: không tự đổi vai trò của mình, không tự khoá mình, không hạ quyền hay khoá **quản
  trị viên cuối cùng**.

---

## 10. Điểm nhấn kỹ thuật

**Chống bán trùng máy.** Checkout chạy trong `$transaction` + `SELECT ... FOR UPDATE ... ORDER BY d.id`
để khoá dòng device rồi mới kiểm `status = IN_STOCK`. `ORDER BY` là **bắt buộc** — thiếu nó hai đơn có
device trùng nhau sẽ khoá ngược chiều và deadlock. Đã kiểm thử hai checkout đồng thời → đúng một
thành công.

> Trước đây còn một lớp thứ hai là ràng buộc `UNIQUE` trên `OrderItem.deviceId`, nhưng **đã gỡ**:
> ràng buộc đó là vĩnh viễn và toàn cục, trong khi huỷ đơn lại trả máy về `IN_STOCK` để bán tiếp →
> máy hiện ra mua được nhưng vừa đặt là vỡ lỗi trùng khoá. Một máy nay có thể xuất hiện ở nhiều
> `OrderItem` (một đơn đã huỷ + một đơn mới), nên mọi truy vấn theo `deviceId` phải dùng
> `findFirst`/`findMany`, không `findUnique`.

**Product vs Device.** `Product` là model/SKU; `Device` là máy vật lý, `serialImei` duy nhất,
**tồn kho = 1**. Giỏ hàng và đơn hàng gắn theo `Device` nên **không có cột `quantity`**.

**Giỏ hàng không giữ chỗ.** Nhiều khách được cùng để một máy trong giỏ; ai checkout trước thì
thắng. Giữ chỗ **chỉ** xảy ra ở tầng Order (`RESERVED`). Máy đã bán vẫn nằm lại trong giỏ người
khác nhưng hiện rõ "đã có người đặt mất" — không lặng lẽ xoá hộ khách.

**Vòng đời máy khi bán.** checkout → `RESERVED` → (callback VNPay thành công | admin xác nhận đơn
COD) → `SOLD`; huỷ đơn hoặc cron quá hạn → về `IN_STOCK`.

**COD vs VNPay.** Đơn VNPay **chỉ được xác nhận bởi callback đã thanh toán** — admin không xác nhận
tay được, nếu không đơn sẽ đi tới `DELIVERED` trong khi thanh toán còn kẹt `PENDING`. Đơn COD thì
ngược lại: admin xác nhận, thu tiền khi giao.

**Hoàn tiền.** `POST /orders/:id/refund` cho đơn đã thanh toán → đánh dấu `REFUNDED` + đóng đơn +
ghi nhật ký. **Không gọi API VNPay** (kế toán hoàn tay). Máy **không** tự nhập lại kho khi đơn đã
`DELIVERED` — lúc đó máy đang ở chỗ khách, nhập kho là tạo ra một máy "ma" được rao bán trong khi
khách vẫn giữ nó; chỉ nhập lại khi người xử lý tích "đã nhận lại hàng".

**Thu cũ đổi mới.** `estimate` (= giá gốc của `TradeInRule` + Σ điều chỉnh theo các lựa chọn) → tạo
yêu cầu (bắt buộc trả lời đủ câu hỏi + nhập IMEI) → nhân viên chốt giá → khách đồng ý → `COMPLETED`
**tự nhập máy vào kho thành một Device bán lại**. Bước nhập kho khoá dòng + idempotent nên bấm hai
lần không nhập kho hai lần.

Máy trạng thái: `PENDING → OFFERED` (nhân viên báo giá lại) `→ ACCEPTED` (khách đồng ý) `→ COMPLETED`,
cộng đường tắt `PENDING → ACCEPTED` khi nhân viên đồng ý luôn giá ước tính. Nhánh hỏng:
`SHOP_REJECTED` / `CUSTOMER_DECLINED`. **Khách không gửi máy đi trước** — máy chỉ mang tới cơ sở
*sau* khi hai bên chốt giá, nên không có trạng thái "đã nhận máy".

**VNPay.** Ký và verify HMAC SHA512 **phía server**, không tin query từ client; callback idempotent.
Giá tiền lưu kiểu **`Int`, đơn vị VNĐ** (không dùng decimal).

**Tìm kiếm.** PostgreSQL full-text search (`to_tsvector`) qua Prisma preview
`fullTextSearchPostgres`, cộng index GIN `pg_trgm` trên `Product.name` cho tìm kiếm `ILIKE`.

**Giá hiển thị của một sản phẩm** là `MIN(Device.sellingPrice)` của các máy còn trong kho, **không
phải** giá niêm yết máy mới. Lọc khoảng giá và sắp xếp theo giá vì thế phải chạy trên giá đó. Prisma
không `orderBy`/`where` được trên aggregate của quan hệ nên dùng `pageProductIdsByPrice`: lấy id
theo điều kiện → ghép giá bằng `groupBy` → lọc/sắp trong bộ nhớ → cắt trang.

**Xoá mềm.** `User`, `Product`, `Device`, `PermissionGroup`, `Address` dùng cột `deletedAt`. Riêng
`Address` là bắt buộc: `Order.addressId` là khóa ngoại `ON DELETE SET NULL`, xoá cứng một địa chỉ là
thổi bay nơi giao của **mọi đơn cũ** trỏ tới nó.

**Nhật ký quản trị.** Bảng `AuditLog` (lưu kèm email người thực hiện) ghi: hoàn tiền, đổi trạng
thái/huỷ đơn, sửa giá, nhập kho, đổi vai trò/trạng thái/nhóm của user, CRUD nhóm quyền, xử lý thu
cũ. Cố tình **fail-open**: ghi log lỗi không được làm vỡ request nghiệp vụ.

---

## 11. Cache và phiên đăng nhập

Dự án **không dùng Redis**. Hai việc Redis từng làm giờ nằm ở:

**a) Cache đọc — trong bộ nhớ tiến trình** ([`src/cache/cache.service.ts`](src/cache/cache.service.ts)):

| Khóa | TTL | Nội dung |
|---|---|---|
| `cache:products:list:<query>` | 60s | Trang danh sách / tìm kiếm sản phẩm (theo từng bộ lọc) |
| `cache:categories:all` | 300s | Cây danh mục |
| `cache:brands:all` | 300s | Danh sách thương hiệu |
| `cache:admin:dashboard` | 30s | Số liệu tổng quan trang quản trị |

Admin thêm/sửa/xoá sản phẩm, danh mục, thương hiệu là khóa tương ứng bị xoá ngay. Cache nằm trong
RAM nên **mất khi restart backend** — bình thường, lần gọi sau tự nạp lại từ DB. Số khóa bị **chặn
trên ở 500, đẩy khóa cũ nhất ra khi vượt**: khóa list sinh từ chuỗi hoá tham số truy vấn nên về lý
thuyết là vô hạn; Redis có `maxmemory` lo hộ, `Map` thì không.

**b) Phiên đăng nhập — bảng `RefreshToken` trong PostgreSQL.** Mỗi lần đăng nhập ghi một dòng chứa
**hash SHA-256 của refresh-token** (không lưu token gốc — rò rỉ bảng cũng không dựng lại được
token) kèm hạn dùng. Xoay token dùng `UPDATE ... WHERE revokedAt IS NULL` nên hai request làm mới
đồng thời chỉ một bên thắng. Dòng hết hạn được cron dọn hằng ngày lúc 3h sáng.

Rate limit chạy trong bộ nhớ NestJS; token xác thực email và OTP nằm ở bảng PostgreSQL.

---

## 12. Bảo mật

- `helmet` (security header), CORS allowlist qua `CORS_ORIGIN`.
- Rate limit toàn cục **120 request/phút**, riêng nhóm `/auth` **10 request/phút** (chống dò mật khẩu).
- Mật khẩu bcrypt; JWT access + refresh có rotation; đổi vai trò/khoá tài khoản là thu hồi sạch phiên.
- `ValidationPipe` whitelist + `forbidNonWhitelisted` (loại field lạ trong body).
- Prisma tham số hoá truy vấn (chống SQL injection); lỗi 5xx không lộ stack trace.
- Cảnh báo lúc khởi động nếu môi trường production còn dùng JWT secret mặc định.

---

## 13. Xác thực email khi đăng ký

- Đăng ký → tài khoản `INACTIVE`, hệ thống gửi email chứa link `GET /auth/verify-email?token=...`.
- Bấm link → `ACTIVE` + `emailVerified = true`, đăng nhập được. Đăng nhập trước khi xác thực → 401.
- Gửi lại: `POST /auth/resend-verification { email }`.
- `MAIL_USER` = địa chỉ Gmail gửi, `MAIL_PASS` = **Gmail App Password 16 ký tự**
  (Google Account → Security → 2-Step Verification → App passwords).
- **`MAIL_USER` để rỗng → chế độ log-only**: in link ra log thay vì gửi mail thật. Dùng để chạy
  demo mà không cần cấu hình email.

---

## 14. Gặp lỗi? Tra ở đây trước

| Hiện tượng | Nguyên nhân & cách xử lý |
|---|---|
| `db:seed` báo `permission denied: "RI_ConstraintTrigger_..." is a system trigger` | Role `datn` chưa có quyền superuser: `psql -U postgres -c "ALTER ROLE datn SUPERUSER;"` |
| `db:seed` báo không tìm thấy `psql` / `pg_dump` | Thư mục `bin` của PostgreSQL chưa có trong PATH (mục 2) |
| `db:seed` báo `unrecognized configuration parameter "transaction_timeout"` hoặc `invalid command \restrict` | Đang dùng PostgreSQL cũ hơn 17. Cách nhanh: xoá dòng `SET transaction_timeout = 0;` và hai dòng `\restrict`/`\unrestrict` trong `prisma/seed.sql`. Cách đúng: cài PostgreSQL 18 |
| `npm install` báo `EPERM ... rename ... query_engine-windows.dll.node` | Windows không cho ghi đè file engine khi backend đang chạy. **Dừng backend rồi cài lại.** Còn lỗi thì kiểm tra tiến trình sót: `Get-Process node` |
| `Can't reach database server at localhost:5432` | PostgreSQL chưa chạy, hoặc `DATABASE_URL` sai user/mật khẩu. Trên Windows nhớ đặt dịch vụ PostgreSQL ở chế độ tự khởi động: `Set-Service postgresql-x64-18 -StartupType Automatic` (PowerShell quyền admin) |
| `http://localhost:3001/health` trả 404 | Đúng thiết kế — địa chỉ thật là `/api/v1/health` |
| Đăng nhập liên tục báo lỗi sau vài lần thử | Giới hạn 10 request/phút cho `/auth`. Chờ một phút |
| VNPay trả 404 | `VNPAY_URL` phải là `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html` |
| Sửa `.env` mà không thấy tác dụng | NestJS watch không nạp lại `.env` — phải restart backend |
| `Cannot find module dist/main` | Xoá `dist/` và `tsconfig.build.tsbuildinfo` rồi chạy lại |
| Cổng 3001 đã bị chiếm | Đổi `PORT` trong `.env`, rồi sửa `NEXT_PUBLIC_API_URL` ở frontend cho khớp |

---

## 15. Kiểm thử

```bash
npm test                    # 57 unit test / 8 suite (Jest)
npm run test:cov            # kèm coverage
bash test/smoke.sh          # integration + tranh chấp đồng thời (cần server chạy + DB đã seed)
bash test/smoke-authz.sh    # ma trận phân quyền 3 vai trò, 27 ca
```

Unit test phủ: định giá thu cũ, chuyển trạng thái đơn, giỏ hàng, xác thực, VNPay, phân quyền, slug,
quản lý người dùng.

Postman collection: `postman/TechShop.postman_collection.json` (chạy "Auth > Login (admin)" trước
để tự lưu token).

# modules/

Mỗi business module (feature) đặt trong một thư mục riêng tại đây, ví dụ:

```
modules/
  auth/
  users/
  products/
  ...
```

Mỗi module theo cấu trúc: `*.module.ts`, `*.controller.ts`, `*.service.ts`,
`dto/`, `entities/` (nếu cần). Service gọi xuống `PrismaService` (repository layer).

Các module được tổ chức theo từng feature (auth, users, products, orders, payments, trade-in, admin…).

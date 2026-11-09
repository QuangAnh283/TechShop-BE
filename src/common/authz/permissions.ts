/**
 * Danh mục mã quyền của TechShop.
 *
 * Mã quyền khai báo ở ĐÂY (code) chứ không nằm trong DB: một mã chỉ có nghĩa khi có
 * endpoint tương ứng, nên nó sinh ra cùng code. Thứ admin tạo ra lúc chạy là NHÓM
 * quyền (`PermissionGroup`) — chỉ nhóm mới nằm trong DB.
 *
 * Quy ước đặt tên: `<miền>.<hành_động>`.
 */

export const PERM = {
  // ---- Sản phẩm & danh mục ----
  PRODUCT_READ: 'product.read', // vào màn quản trị sản phẩm (kể cả hàng đã ẩn)
  PRODUCT_MANAGE: 'product.manage', // tạo / sửa / ẩn / thông số kỹ thuật
  PRODUCT_DELETE: 'product.delete',
  CATALOG_MANAGE: 'catalog.manage', // danh mục + thương hiệu

  // ---- Giá (tách riêng khỏi product.manage) ----
  // Xuyên suốt: Product.basePriceNew, Device.sellingPrice/purchasePrice,
  // giá lúc nhập kho và lúc hoàn tất thu cũ.
  PRICE_UPDATE: 'price.update',

  // ---- Kho & thiết bị ----
  INVENTORY_READ: 'inventory.read',
  INVENTORY_MANAGE: 'inventory.manage', // nhập / xuất / sửa thuộc tính máy
  WAREHOUSE_MANAGE: 'warehouse.manage',
  DEVICE_WARRANTY: 'device.warranty',
  DEVICE_REPAIR: 'device.repair',

  // ---- Media & đánh giá ----
  MEDIA_UPLOAD: 'media.upload',
  MEDIA_DELETE: 'media.delete',
  REVIEW_DELETE_ANY: 'review.delete_any', // xóa đánh giá của người khác

  // ---- Đơn hàng ----
  ORDER_READ_ALL: 'order.read_all',
  ORDER_PROCESS: 'order.process', // đổi trạng thái đơn
  ORDER_CANCEL_ANY: 'order.cancel_any', // hủy đơn của người khác
  ORDER_REFUND: 'order.refund', // DỰ TRỮ — chưa gắn endpoint (xem ghi chú cuối file)

  // ---- Thu cũ đổi mới ----
  TRADEIN_READ: 'tradein.read',
  TRADEIN_ASSIGN: 'tradein.assign', // nhận xử lý / gán kỹ thuật viên
  TRADEIN_INSPECT: 'tradein.inspect', // kiểm định + chốt giá
  TRADEIN_COMPLETE: 'tradein.complete', // hoàn tất + nhập máy vào kho
  TRADEIN_CONFIG: 'tradein.config', // bộ câu hỏi + quy tắc định giá

  // ---- Báo cáo ----
  REPORT_READ: 'report.read',

  // ---- Chỉ ADMIN (xem ADMIN_ONLY_PERMISSIONS) ----
  USER_MANAGE: 'user.manage',
  PERMISSION_MANAGE: 'permission.manage',
  AUDIT_READ: 'audit.read', // DỰ TRỮ — chưa có bảng nhật ký
} as const;

export type Permission = (typeof PERM)[keyof typeof PERM];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERM);

/**
 * Những mã KHÔNG BAO GIỜ được gán vào nhóm quyền.
 *
 * Nếu cho gán, một nhân viên có `permission.manage` sẽ tự sửa nhóm của mình thành
 * toàn quyền — leo thang đặc quyền, làm rỗng nghĩa dòng "Phân quyền: chỉ Admin".
 * Service tạo/sửa nhóm phải từ chối 400 nếu danh sách chứa các mã này.
 */
export const ADMIN_ONLY_PERMISSIONS: Permission[] = [
  PERM.USER_MANAGE,
  PERM.PERMISSION_MANAGE,
  PERM.AUDIT_READ,
];

/** Mã có thể gán cho nhân viên (dùng để validate DTO và render giao diện). */
export const ASSIGNABLE_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter(
  (p) => !ADMIN_ONLY_PERMISSIONS.includes(p),
);

export interface PermissionMeta {
  code: Permission;
  label: string;
  hint?: string;
}

/**
 * Catalog để frontend render lưới chọn quyền — phục vụ qua `GET /admin/permissions`
 * thay vì để FE hardcode lại, tránh lệch nhãn khi thêm quyền mới.
 * Chỉ liệt kê các mã gán được (mã ADMIN_ONLY cố ý không xuất hiện).
 */
export const PERMISSION_CATALOG: { group: string; items: PermissionMeta[] }[] = [
  {
    group: 'Sản phẩm & danh mục',
    items: [
      { code: PERM.PRODUCT_READ, label: 'Xem danh sách sản phẩm quản trị' },
      { code: PERM.PRODUCT_MANAGE, label: 'Thêm / sửa / ẩn sản phẩm', hint: 'Không gồm giá' },
      { code: PERM.PRODUCT_DELETE, label: 'Xóa sản phẩm' },
      { code: PERM.CATALOG_MANAGE, label: 'Quản lý danh mục & thương hiệu' },
    ],
  },
  {
    group: 'Giá',
    items: [
      {
        code: PERM.PRICE_UPDATE,
        label: 'Thay đổi giá',
        hint: 'Giá bán, giá nhập, giá máy thu cũ khi nhập kho',
      },
    ],
  },
  {
    group: 'Kho & thiết bị',
    items: [
      { code: PERM.INVENTORY_READ, label: 'Xem kho & thiết bị' },
      { code: PERM.INVENTORY_MANAGE, label: 'Nhập / xuất kho, sửa thông tin máy' },
      { code: PERM.WAREHOUSE_MANAGE, label: 'Quản lý kho hàng' },
      { code: PERM.DEVICE_WARRANTY, label: 'Cập nhật bảo hành' },
      { code: PERM.DEVICE_REPAIR, label: 'Ghi nhận sửa chữa' },
    ],
  },
  {
    group: 'Nội dung & đánh giá',
    items: [
      { code: PERM.MEDIA_UPLOAD, label: 'Tải ảnh lên' },
      { code: PERM.MEDIA_DELETE, label: 'Xóa ảnh' },
      { code: PERM.REVIEW_DELETE_ANY, label: 'Xóa đánh giá của khách' },
    ],
  },
  {
    group: 'Đơn hàng',
    items: [
      { code: PERM.ORDER_READ_ALL, label: 'Xem toàn bộ đơn hàng' },
      { code: PERM.ORDER_PROCESS, label: 'Xử lý đơn (đổi trạng thái)' },
      { code: PERM.ORDER_CANCEL_ANY, label: 'Hủy đơn của khách' },
      { code: PERM.ORDER_REFUND, label: 'Hoàn tiền', hint: 'Chưa triển khai' },
    ],
  },
  {
    group: 'Thu cũ đổi mới',
    items: [
      { code: PERM.TRADEIN_READ, label: 'Xem yêu cầu thu cũ' },
      { code: PERM.TRADEIN_ASSIGN, label: 'Nhận xử lý / gán kỹ thuật viên' },
      { code: PERM.TRADEIN_INSPECT, label: 'Kiểm định & chốt giá' },
      {
        code: PERM.TRADEIN_COMPLETE,
        label: 'Hoàn tất & nhập máy vào kho',
        hint: 'Tạo tài sản mới trong kho',
      },
      { code: PERM.TRADEIN_CONFIG, label: 'Sửa bộ câu hỏi & quy tắc định giá' },
    ],
  },
  {
    group: 'Báo cáo',
    items: [{ code: PERM.REPORT_READ, label: 'Xem tổng quan & báo cáo doanh thu' }],
  },
];

/** Mã nhóm preset — dùng làm id cố định luôn để DB mọi máy khớp nhau. */
export const PRESET_GROUPS: {
  id: string;
  code: string;
  name: string;
  description: string;
  permissions: Permission[];
}[] = [
  {
    id: 'grp_sales',
    code: 'SALES',
    name: 'Nhân viên bán hàng',
    description: 'Tiếp nhận và xử lý đơn hàng, không đụng tới giá và kho.',
    permissions: [
      PERM.ORDER_READ_ALL,
      PERM.ORDER_PROCESS,
      PERM.ORDER_CANCEL_ANY,
      PERM.PRODUCT_READ,
      PERM.INVENTORY_READ,
    ],
  },
  {
    id: 'grp_warehouse',
    code: 'WAREHOUSE',
    name: 'Nhân viên kho',
    description: 'Nhập xuất kho, bảo hành, sửa chữa. Không được sửa giá.',
    permissions: [
      PERM.INVENTORY_READ,
      PERM.INVENTORY_MANAGE,
      PERM.WAREHOUSE_MANAGE,
      PERM.DEVICE_WARRANTY,
      PERM.DEVICE_REPAIR,
      PERM.MEDIA_UPLOAD,
      PERM.PRODUCT_READ,
    ],
  },
  {
    id: 'grp_technician',
    code: 'TECHNICIAN',
    name: 'Kỹ thuật viên thu cũ',
    description: 'Xử lý yêu cầu thu cũ từ lúc tiếp nhận tới lúc hoàn tất; quản lý kho kỹ thuật.',
    permissions: [
      PERM.TRADEIN_READ,
      PERM.TRADEIN_ASSIGN,
      PERM.TRADEIN_INSPECT,
      // KTV là người chốt cả hai đầu của luồng thu cũ: chấp nhận yêu cầu (PENDING→ACCEPTED,
      // kể cả khi giữ nguyên giá ước tính) và đánh dấu hoàn tất sau khi giao dịch trực tiếp
      // xong. Thiếu quyền này thì KTV kiểm định xong là tắc, phải chờ admin.
      PERM.TRADEIN_COMPLETE,
      PERM.INVENTORY_READ,
      PERM.INVENTORY_MANAGE,
      PERM.DEVICE_WARRANTY,
      PERM.DEVICE_REPAIR,
      PERM.MEDIA_UPLOAD,
    ],
  },
  {
    id: 'grp_content',
    code: 'CONTENT',
    name: 'Biên tập nội dung',
    description: 'Quản lý sản phẩm, danh mục, hình ảnh và đánh giá. Không được sửa giá.',
    permissions: [
      PERM.PRODUCT_READ,
      PERM.PRODUCT_MANAGE,
      PERM.CATALOG_MANAGE,
      PERM.MEDIA_UPLOAD,
      PERM.MEDIA_DELETE,
      PERM.REVIEW_DELETE_ANY,
    ],
  },
  {
    id: 'grp_manager',
    code: 'MANAGER',
    name: 'Quản lý cửa hàng',
    description: 'Toàn bộ nghiệp vụ, gồm cả các thao tác chạm tiền. Không quản trị tài khoản.',
    permissions: ASSIGNABLE_PERMISSIONS.filter((p) => p !== PERM.ORDER_REFUND),
  },
];

/**
 * Ghi chú phạm vi (chốt 2026-10-20): `order.refund` và `audit.read` được khai báo để
 * khớp bảng phân quyền nghiệp vụ, nhưng CHƯA gắn vào endpoint nào — hệ thống hiện
 * chưa có luồng hoàn tiền riêng (chỉ đổi trạng thái khi hủy đơn) và chưa có bảng
 * nhật ký quản trị. Khi làm hai tính năng đó, gắn mã sẵn có này vào là đủ.
 */

-- Nhóm quyền nghiệp vụ quản lý được trong DB (phân quyền chi tiết cho nhân viên).
-- CHỈ DDL: dữ liệu nhóm preset được tạo bằng upsert idempotent lúc khởi động app
-- (src/modules/permissions/permissions.bootstrap.ts). Lý do: `npm run db:dump` xuất
-- dữ liệu ra seed.sql, nên nếu INSERT ở đây thì lần `migrate reset && db:seed` sau
-- sẽ vỡ vì trùng khóa chính.

CREATE TABLE "PermissionGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PermissionGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PermissionGroup_code_key" ON "PermissionGroup"("code");

ALTER TABLE "User" ADD COLUMN "permissionGroupId" TEXT;

CREATE INDEX "User_permissionGroupId_idx" ON "User"("permissionGroupId");

ALTER TABLE "User" ADD CONSTRAINT "User_permissionGroupId_fkey"
    FOREIGN KEY ("permissionGroupId") REFERENCES "PermissionGroup"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

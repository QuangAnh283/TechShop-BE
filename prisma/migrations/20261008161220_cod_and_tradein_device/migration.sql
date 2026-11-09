-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'COD';

-- DropIndex
DROP INDEX "Device_product_status_idx";

-- DropIndex
DROP INDEX "Order_createdAt_idx";

-- DropIndex
DROP INDEX "Product_name_trgm_idx";

-- AlterTable
ALTER TABLE "TradeInRequest" ADD COLUMN     "deviceDescription" TEXT,
ADD COLUMN     "imei" TEXT;

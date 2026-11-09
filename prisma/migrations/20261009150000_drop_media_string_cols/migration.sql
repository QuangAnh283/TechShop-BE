-- Bỏ các cột media dạng chuỗi sau khi đã backfill sang MediaAsset.
ALTER TABLE "Product" DROP COLUMN "thumbnailUrl";
ALTER TABLE "ProductImage" DROP COLUMN "url";
ALTER TABLE "Brand" DROP COLUMN "logoUrl";
ALTER TABLE "TradeInEvidence" DROP COLUMN "imageUrl";

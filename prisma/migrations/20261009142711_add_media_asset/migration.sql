-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "logoMediaId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "thumbnailMediaId" TEXT;

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "mediaId" TEXT,
ALTER COLUMN "url" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TradeInEvidence" ADD COLUMN     "mediaId" TEXT,
ALTER COLUMN "imageUrl" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_path_key" ON "MediaAsset"("path");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_thumbnailMediaId_fkey" FOREIGN KEY ("thumbnailMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeInEvidence" ADD CONSTRAINT "TradeInEvidence_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

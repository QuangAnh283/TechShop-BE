/**
 * Backfill MediaAsset từ các cột URL/path cũ (chạy 1 lần).
 *   npx tsx prisma/backfill-media.ts
 * Tạo MediaAsset (dedup theo path) cho mọi ảnh đang tham chiếu bằng chuỗi,
 * rồi gán FK: Product.thumbnailMediaId, ProductImage.mediaId, Brand.logoMediaId,
 * TradeInEvidence.mediaId. File local nằm dưới ./uploads (prefix /uploads/).
 */
import { PrismaClient } from '@prisma/client';
import { statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? 'uploads';

function mimeFromPath(p: string): string {
  const ext = p.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

/** Đổi path public "/uploads/x/y.webp" → file local "uploads/x/y.webp". */
function localFile(path: string): string | null {
  if (!path.startsWith('/uploads/')) return null;
  const rel = path.slice('/uploads/'.length);
  return join(process.cwd(), UPLOADS_DIR, rel);
}

async function probe(path: string): Promise<{ size: number; width?: number; height?: number }> {
  const file = localFile(path);
  if (!file) return { size: 0 };
  try {
    const size = statSync(file).size;
    let width: number | undefined;
    let height: number | undefined;
    try {
      const mod: any = await import('image-size');
      const fn = mod.imageSize ?? mod.default;
      const r = fn(readFileSync(file));
      width = r?.width;
      height = r?.height;
    } catch {
      /* bỏ qua kích thước nếu không đọc được */
    }
    return { size, width, height };
  } catch {
    console.warn(`  ! file không tồn tại: ${file}`);
    return { size: 0 };
  }
}

const cache = new Map<string, string>(); // path -> mediaAsset.id

async function ensureMedia(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit) return hit;
  const existing = await prisma.mediaAsset.findUnique({ where: { path } });
  if (existing) {
    cache.set(path, existing.id);
    return existing.id;
  }
  const meta = await probe(path);
  const created = await prisma.mediaAsset.create({
    data: { path, mime: mimeFromPath(path), size: meta.size, width: meta.width, height: meta.height },
  });
  cache.set(path, created.id);
  return created.id;
}

async function main() {
  let count = 0;

  console.log('» Product.thumbnailUrl → thumbnailMedia');
  const products = await prisma.product.findMany({
    where: { thumbnailUrl: { not: null }, thumbnailMediaId: null },
    select: { id: true, thumbnailUrl: true },
  });
  for (const p of products) {
    const mediaId = await ensureMedia(p.thumbnailUrl!);
    await prisma.product.update({ where: { id: p.id }, data: { thumbnailMediaId: mediaId } });
    count++;
  }
  console.log(`  ${products.length} sản phẩm`);

  console.log('» ProductImage.url → media');
  const images = await prisma.productImage.findMany({
    where: { url: { not: null }, mediaId: null },
    select: { id: true, url: true },
  });
  for (const img of images) {
    const mediaId = await ensureMedia(img.url!);
    await prisma.productImage.update({ where: { id: img.id }, data: { mediaId } });
    count++;
  }
  console.log(`  ${images.length} ảnh gallery`);

  console.log('» Brand.logoUrl → logoMedia');
  const brands = await prisma.brand.findMany({
    where: { logoUrl: { not: null }, logoMediaId: null },
    select: { id: true, logoUrl: true },
  });
  for (const b of brands) {
    const mediaId = await ensureMedia(b.logoUrl!);
    await prisma.brand.update({ where: { id: b.id }, data: { logoMediaId: mediaId } });
    count++;
  }
  console.log(`  ${brands.length} logo thương hiệu`);

  console.log('» TradeInEvidence.imageUrl → media');
  const evidences = await prisma.tradeInEvidence.findMany({
    where: { imageUrl: { not: null }, mediaId: null },
    select: { id: true, imageUrl: true },
  });
  for (const e of evidences) {
    const mediaId = await ensureMedia(e.imageUrl!);
    await prisma.tradeInEvidence.update({ where: { id: e.id }, data: { mediaId } });
    count++;
  }
  console.log(`  ${evidences.length} ảnh thu cũ`);

  const total = await prisma.mediaAsset.count();
  console.log(`\n✓ Backfill xong: ${count} tham chiếu, ${total} MediaAsset.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

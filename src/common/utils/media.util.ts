/**
 * Tiện ích map quan hệ MediaAsset → chuỗi URL để giữ nguyên contract API cho frontend.
 * DB chuẩn hoá (FK tới MediaAsset) nhưng response vẫn trả `thumbnailUrl`/`images[].url`/...
 */

/** Select chỉ lấy path của MediaAsset (dùng trong include của Prisma). */
export const MEDIA_SELECT = { select: { path: true } } as const;

export function toUrl(media?: { path: string } | null): string | null {
  return media?.path ?? null;
}

/** Thêm `thumbnailUrl` + `images[].url` cho product đã include thumbnailMedia + images.media. */
export function mapProductMedia<
  T extends {
    thumbnailMedia?: { path: string } | null;
    images?: Array<{ media?: { path: string } | null }>;
  },
>(product: T): T & { thumbnailUrl: string | null } {
  return {
    ...product,
    thumbnailUrl: toUrl(product.thumbnailMedia),
    ...(product.images
      ? { images: product.images.map((img) => ({ ...img, url: toUrl(img.media) })) }
      : {}),
  };
}

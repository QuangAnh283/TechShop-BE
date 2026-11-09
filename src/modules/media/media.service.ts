import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private uploadsDir(): string {
    return this.config.get<string>('uploadsDir') ?? 'uploads';
  }

  /** Lưu file upload vào uploads/media + tạo MediaAsset. Trả { id, url }. */
  async save(file?: Express.Multer.File, uploadedById?: string) {
    if (!file) throw new BadRequestException('Thiếu file upload (field "file")');
    const ext = EXT_BY_MIME[file.mimetype];
    if (!ext) throw new BadRequestException('Chỉ chấp nhận ảnh JPEG/PNG/WEBP/GIF');

    const name = `${randomUUID()}.${ext}`;
    const dir = join(process.cwd(), this.uploadsDir(), 'media');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), file.buffer);

    const path = `/uploads/media/${name}`;
    let width: number | undefined;
    let height: number | undefined;
    try {
      const mod: any = await import('image-size');
      const fn = mod.imageSize ?? mod.default;
      const r = fn(file.buffer);
      width = r?.width;
      height = r?.height;
    } catch {
      /* kích thước không bắt buộc */
    }

    const asset = await this.prisma.mediaAsset.create({
      data: { path, mime: file.mimetype, size: file.size, width, height, uploadedById },
    });
    return { id: asset.id, url: asset.path, width: asset.width, height: asset.height };
  }

  /** Xoá media nếu không còn entity nào tham chiếu. */
  async remove(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            productThumbnails: true,
            productImages: true,
            brandLogos: true,
            evidences: true,
          },
        },
      },
    });
    if (!asset) throw new NotFoundException('Không tìm thấy media');
    const refs =
      asset._count.productThumbnails +
      asset._count.productImages +
      asset._count.brandLogos +
      asset._count.evidences;
    if (refs > 0) {
      throw new ConflictException('Media đang được sử dụng, không thể xoá');
    }

    const rel = asset.path.replace(/^\/uploads\//, '');
    await unlink(join(process.cwd(), this.uploadsDir(), rel)).catch(() => undefined);
    await this.prisma.mediaAsset.delete({ where: { id } });
    return { message: 'Đã xoá media' };
  }
}

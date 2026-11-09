import {
  Controller,
  Delete,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { PERM } from '../../common/authz/permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { MediaService } from './media.service';

const MAX_SIZE_MB = Number(process.env.MEDIA_MAX_SIZE_MB ?? '5');

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @RequirePermissions(PERM.MEDIA_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
      fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    return this.media.save(file, user.id);
  }

  @Delete(':id')
  @RequirePermissions(PERM.MEDIA_DELETE)
  remove(@Param('id') id: string) {
    return this.media.remove(id);
  }
}

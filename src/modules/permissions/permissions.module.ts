import { Global, Module } from '@nestjs/common';
import { PermissionGroupsController } from './permission-groups.controller';
import { PermissionGroupsService } from './permission-groups.service';
import { PermissionsBootstrap } from './permissions.bootstrap';
import { PermissionsService } from './permissions.service';

/**
 * @Global như PrismaModule/CacheModule: PermissionsService được dùng ở JwtStrategy và
 * nhiều module khác, để global thì khỏi phải import lặp ở từng chỗ.
 */
@Global()
@Module({
  controllers: [PermissionGroupsController],
  providers: [PermissionsService, PermissionGroupsService, PermissionsBootstrap],
  exports: [PermissionsService],
})
export class PermissionsModule {}

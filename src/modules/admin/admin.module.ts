import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  // AuthModule để dùng revokeAllSessions khi đổi vai trò / khóa tài khoản.
  imports: [AuthModule],
  controllers: [AdminController, AdminUsersController],
  providers: [AdminService, AdminUsersService],
})
export class AdminModule {}

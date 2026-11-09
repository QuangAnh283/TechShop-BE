import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { PermissionsService } from '../../permissions/permissions.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly permissions: PermissionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret') ?? 'dev-access-secret',
    });
  }

  /**
   * Giá trị trả về được gắn vào request.user.
   *
   * Chỉ dùng `payload.sub` để biết user là AI; còn vai trò và quyền thì đọc tươi
   * (Redis, miss thì DB). Nhờ vậy khóa tài khoản / đổi vai trò / gỡ quyền có hiệu
   * lực ngay trên MỌI route đã đăng nhập, thay vì phải chờ access token hết hạn.
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const access = await this.permissions.getEffective(payload.sub);
    if (!access) throw new UnauthorizedException('Tài khoản không còn hiệu lực');

    return {
      id: access.userId,
      email: access.email,
      role: access.role,
      permissions: access.permissions,
    };
  }
}

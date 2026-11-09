import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Bảo vệ route bằng JWT access token (chiến lược 'jwt'). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

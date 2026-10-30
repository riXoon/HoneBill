import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../modules/auth/auth.service.js';

@Injectable()
export class Sep10JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: unknown;
    }>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ')
      ? header.slice(7).trim()
      : undefined;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let payload: { sub?: unknown };
    try {
      payload = await this.jwtService.verifyAsync<{ sub?: unknown }>(token, {
        algorithms: ['HS256'],
        issuer: this.authService.tokenIssuer,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.user = payload;
    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../modules/auth/auth.service.js';
@Injectable()
export class Sep10JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
   //rivate readonly configService: ConfigService,  // only if homeDomains is public; otherwise inject ConfigService and read SEP10_HOME_DOMAINS
    private readonly authService: AuthService
  ) {}

     async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    try {
      request.user = await this.jwtService.verifyAsync(token, {
        algorithms: ['HS256'],
        issuer: this.authService.tokenIssuer,
      });
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
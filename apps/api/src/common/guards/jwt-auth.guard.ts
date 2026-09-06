import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from '@guachafit/shared';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwtSecret: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'guachafit_jwt_super_secret_key_2026';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Encabezado de autorización ausente');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Formato de Bearer token inválido');
    }

    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;
      request.user = decoded;
      return true;
    } catch (err: any) {
      throw new UnauthorizedException('Token inválido o expirado: ' + err.message);
    }
  }
}

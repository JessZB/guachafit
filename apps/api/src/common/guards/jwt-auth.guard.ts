import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from '@guachafit/shared';
import { obtenerSecretosJwt } from '../config/secretos-jwt';
// B3: texto que ve el usuario; el detalle técnico queda solo en los logs.
import { MENSAJE_SESION_VENCIDA } from '../mensajes-acceso';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly jwtSecret: string;

  constructor() {
    // A3: el secreto sale de la fuente única (fail-fast en producción).
    this.jwtSecret = obtenerSecretosJwt().jwtSecret;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      this.logger.debug('Encabezado de autorización ausente');
      throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      this.logger.debug('Formato de Bearer token inválido');
      throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
    }

    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;
      request.user = decoded;
      return true;
    } catch (err: any) {
      this.logger.debug(`Token inválido o expirado: ${err?.message}`);
      throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
    }
  }
}

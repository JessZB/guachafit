import { Injectable, Optional, Inject, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { VIGENCIA_ENLACE_ACTIVACION_MS, VIGENCIA_ENLACE_RECUPERACION_MS } from '@guachafit/shared';
import {
  ENCRYPTION_KEY_DESARROLLO,
  analizarClaveCifrado,
} from '../config/validar-configuracion-produccion';

/** Costo bcrypt de las contraseñas (A6: el hash ficticio del login debe usar el mismo). */
export const RONDAS_BCRYPT = 10;

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly encryptionKey: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  constructor(@Optional() @Inject('ENCRYPTION_KEY') customKey?: string) {
    // Mismas reglas y mensajes que la validación de arranque: la clave explícita o de entorno
    // manda; la clave de desarrollo solo se usa cuando no se proporcionó ninguna y el entorno no
    // es producción; una clave mal formada nunca se acepta (tampoco en local).
    const desdeParametro = (customKey ?? '').trim();
    const desdeEntorno = (process.env.ENCRYPTION_KEY ?? '').trim();
    const analisis = analizarClaveCifrado(desdeParametro || desdeEntorno);

    if (analisis.problemaFatal) {
      throw new Error(`[Configuración] ${analisis.problemaFatal}`);
    }
    if (process.env.NODE_ENV === 'production' && analisis.problemaProduccion) {
      throw new Error(`[Configuración] ${analisis.problemaProduccion}`);
    }
    if (analisis.advertencia) {
      this.logger.warn(analisis.advertencia);
    }

    this.encryptionKey = Buffer.from(analisis.claveEfectiva ?? ENCRYPTION_KEY_DESARROLLO, 'hex');
  }

  /**
   * Hashea una contraseña usando bcryptjs con 10 rondas de salt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, RONDAS_BCRYPT);
  }

  /**
   * Compara una contraseña en texto plano contra su hash bcrypt
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Genera token aleatorio criptográfico para invitaciones (RF-011)
   * Retorna el token en texto plano (para enviar por email), su hash SHA-256 (para BD) y su
   * expiración (`VIGENCIA_ENLACE_ACTIVACION_MS`, compartida con los correos y la web).
   */
  generateInvitationToken(): { rawToken: string; tokenHash: string; expiresAt: Date } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashSha256(rawToken);
    const expiresAt = new Date(Date.now() + VIGENCIA_ENLACE_ACTIVACION_MS);

    return { rawToken, tokenHash, expiresAt };
  }

  /**
   * Token aleatorio de un solo uso para restablecer la contraseña. Igual que la invitación
   * (32 bytes, hash SHA-256 para la BD) pero con la vigencia corta de la recuperación
   * (`VIGENCIA_ENLACE_RECUPERACION_MS`): el enlace viaja por correo y da acceso a la cuenta.
   */
  generarTokenRecuperacion(): { rawToken: string; tokenHash: string; expiresAt: Date } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashSha256(rawToken);
    const expiresAt = new Date(Date.now() + VIGENCIA_ENLACE_RECUPERACION_MS);
    return { rawToken, tokenHash, expiresAt };
  }

  /**
   * Calcula hash SHA-256 hexadecimal
   */
  hashSha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Cifra un texto confidencial (Ficha de Salud, RNF-003) usando AES-256-GCM
   * Formato de salida: ivHex:authTagHex:encryptedHex
   */
  encryptHealthRecord(plainText: string): string {
    const iv = crypto.randomBytes(12); // IV de 96 bits recomendado para GCM
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Descifra un texto protegido en AES-256-GCM
   */
  decryptHealthRecord(cipherPayload: string): string {
    const parts = cipherPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato inválido de payload cifrado AES-256-GCM');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

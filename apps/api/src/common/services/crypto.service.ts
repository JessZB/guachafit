import { Injectable, Optional, Inject } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class CryptoService {
  private readonly encryptionKey: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  constructor(@Optional() @Inject('ENCRYPTION_KEY') customKey?: string) {
    // Clave de 32 bytes requerida para AES-256-GCM
    const keyString = customKey || process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    this.encryptionKey = Buffer.from(keyString.slice(0, 64), 'hex');
  }

  /**
   * Hashea una contraseña usando bcryptjs con 10 rondas de salt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Compara una contraseña en texto plano contra su hash bcrypt
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Genera token aleatorio criptográfico para invitaciones (RF-011)
   * Retorna el token en texto plano (para enviar por email), su hash SHA-256 (para BD) y expiración a 48h
   */
  generateInvitationToken(): { rawToken: string; tokenHash: string; expiresAt: Date } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashSha256(rawToken);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 horas

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

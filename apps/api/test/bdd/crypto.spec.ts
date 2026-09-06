import { describe, it, expect } from 'vitest';
import { CryptoService } from '../../src/common/services/crypto.service';

describe('RNF-003 / Seguridad y Criptografía: CryptoService', () => {
  const secretKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 32 bytes hex
  const cryptoService = new CryptoService(secretKey);

  it('debe hashear y verificar contraseñas correctamente', async () => {
    const password = 'PasswordSegura#2026';
    const hash = await cryptoService.hashPassword(password);

    expect(hash).not.toBe(password);
    expect(await cryptoService.comparePassword(password, hash)).toBe(true);
    expect(await cryptoService.comparePassword('PasswordIncorrecta', hash)).toBe(false);
  });

  it('debe generar tokens de invitación con hash SHA-256 y expiración a 48h (RF-011)', () => {
    const { rawToken, tokenHash, expiresAt } = cryptoService.generateInvitationToken();

    expect(rawToken.length).toBeGreaterThanOrEqual(32);
    expect(tokenHash).toBe(cryptoService.hashSha256(rawToken));

    const now = new Date();
    const diffHours = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(48);
  });

  it('debe cifrar y descifrar la ficha de salud privada usando AES-256-GCM (RNF-003)', () => {
    const fichaMedica = 'Cirugía de ligamento cruzado en 2022. Evitar sentadilla pesada.';
    const encrypted = cryptoService.encryptHealthRecord(fichaMedica);

    expect(encrypted).not.toBe(fichaMedica);
    expect(encrypted).toContain(':'); // formato iv:authTag:encrypted

    const decrypted = cryptoService.decryptHealthRecord(encrypted);
    expect(decrypted).toBe(fichaMedica);
  });
});
